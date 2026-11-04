import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { canTransition, CLOSED_STATUSES, RESOLVABLE_STATUSES } from '../common/catalog';
import { digest, matchesDigest, randomToken } from '../common/crypto';
import { ApiError } from '../common/http/api-error';
import { formatProtocol, parseProtocol } from '../common/protocol';
import { DatabaseService } from '../database/database.service';
import { SchemaService } from '../database/schema.service';
import { PushService } from '../push/push.service';
import type { AddNoteDto, CreateTicketDto, ListTicketsQuery, ResolveTicketDto, UpdateTicketDto } from './dto/ticket.dto';
import { EventsService } from './events.service';
import { ImageService } from './image.service';
import { toDetail, toSummary } from './ticket.serializer';
import type { Actor, TicketDetail } from './ticket.types';
import { TicketsRepository } from './tickets.repository';

const NOT_FOUND = 'Chamado não encontrado';

/** Ticket lifecycle rules. Controllers stay thin; every state change runs in a transaction with a row lock. */
@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly repo: TicketsRepository,
    private readonly schema: SchemaService,
    private readonly images: ImageService,
    private readonly events: EventsService,
    private readonly push: PushService,
  ) {}

  async detail(id: number): Promise<TicketDetail> {
    const row = await this.repo.findById(id);
    if (!row) throw new ApiError(HttpStatus.NOT_FOUND, NOT_FOUND);
    return toDetail(row, await this.repo.history(id));
  }

  async list(query: ListTicketsQuery, actor: Actor) {
    const { rows, total } = await this.repo.list(query, actor.id);
    return { items: rows.map(toSummary), total };
  }

  async create(dto: CreateTicketDto, attachment?: Buffer): Promise<TicketDetail & { access_key: string }> {
    const image = attachment ? await this.images.sanitize(attachment) : null;
    const accessKey = randomToken();
    const id = await this.db.transaction(async client => {
      const ticketId = await this.repo.insert(client, {
        accessHash: digest(accessKey),
        name: dto.name,
        department: dto.department,
        state: dto.state,
        location: dto.location,
        category: dto.category,
        affectedSystem: dto.affected_system,
        title: dto.title,
        description: dto.description,
      });
      const context = dto.affected_system ? ` — sistema: ${dto.affected_system}` : '';
      await this.repo.addHistory(client, ticketId, `Chamado criado — aguardando TI${context}`);
      if (image) await this.repo.insertAttachment(client, ticketId, image);
      return ticketId;
    });
    this.events.changed(id);
    this.push.notifyNewTicket(id).catch(error => this.logger.warn({ msg: 'Web Push falhou', error: (error as Error).message }));
    return { ...(await this.detail(id)), access_key: accessKey };
  }

  async assign(id: number, actor: Actor): Promise<TicketDetail> {
    await this.db.transaction(async client => {
      const ticket = await this.repo.findById(id, client, true);
      if (!ticket) throw new ApiError(HttpStatus.NOT_FOUND, NOT_FOUND);
      if (ticket.status !== 'NOVO' || ticket.technician_id !== null) {
        throw new ApiError(HttpStatus.CONFLICT, 'Este chamado já foi assumido ou encerrado.');
      }
      await this.repo.assign(client, id, actor.id);
      await this.repo.addHistory(client, id, `${actor.name} assumiu o chamado — status EM_ATENDIMENTO`);
    });
    this.events.changed(id);
    return this.detail(id);
  }

  async update(id: number, dto: UpdateTicketDto, actor: Actor): Promise<TicketDetail> {
    await this.db.transaction(async client => {
      const ticket = await this.repo.findById(id, client, true);
      if (!ticket) throw new ApiError(HttpStatus.NOT_FOUND, NOT_FOUND);
      if (CLOSED_STATUSES.includes(ticket.status)) {
        throw new ApiError(HttpStatus.CONFLICT, 'Chamados encerrados não podem ser alterados.');
      }
      if (dto.status && dto.status !== ticket.status) {
        if (!canTransition(ticket.status, dto.status)) {
          throw new ApiError(HttpStatus.CONFLICT, 'Transição inválida. Use assumir ou resolver quando apropriado.');
        }
        await this.repo.setStatus(client, id, dto.status);
        await this.repo.addHistory(client, id, `${actor.name}: status ${ticket.status} → ${dto.status}`);
      }
      if (dto.priority && dto.priority !== ticket.priority) {
        await this.repo.setPriority(client, id, dto.priority);
        await this.repo.addHistory(client, id, `${actor.name}: prioridade ${ticket.priority} → ${dto.priority}`);
      }
    });
    this.events.changed(id);
    return this.detail(id);
  }

  async resolve(id: number, dto: ResolveTicketDto, actor: Actor): Promise<TicketDetail> {
    await this.db.transaction(async client => {
      const ticket = await this.repo.findById(id, client, true);
      if (!ticket) throw new ApiError(HttpStatus.NOT_FOUND, NOT_FOUND);
      if (!RESOLVABLE_STATUSES.includes(ticket.status)) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'Assuma o chamado antes de resolver; chamados encerrados não podem ser resolvidos novamente.',
        );
      }
      await this.repo.resolve(client, id, dto.solution);
      await this.repo.addHistory(client, id, `${actor.name} resolveu o chamado — ${dto.solution}`);
    });
    this.events.changed(id);
    return this.detail(id);
  }

  /** Message from the technician to the employee, shown in the public tracking page. */
  async addNote(id: number, dto: AddNoteDto, actor: Actor): Promise<TicketDetail> {
    await this.db.transaction(async client => {
      const ticket = await this.repo.findById(id, client, true);
      if (!ticket) throw new ApiError(HttpStatus.NOT_FOUND, NOT_FOUND);
      if (this.schema.historyKind) await this.repo.addHistory(client, id, dto.message, 'note', actor.name);
      else await this.repo.addHistory(client, id, `Mensagem de ${actor.name}: ${dto.message}`);
    });
    this.events.changed(id);
    return this.detail(id);
  }

  /** Issues a new tracking key (e.g. the employee lost the link). The previous link stops working. */
  async regenerateTrackingKey(id: number, actor: Actor): Promise<{ protocol: string; access_key: string }> {
    const accessKey = randomToken();
    await this.db.transaction(async client => {
      const ticket = await this.repo.findById(id, client, true);
      if (!ticket) throw new ApiError(HttpStatus.NOT_FOUND, NOT_FOUND);
      await this.repo.setAccessHash(client, id, digest(accessKey));
      // Audit trail: who and when (timestamp from the database), visible in the ticket history.
      await this.repo.addHistory(client, id, `${actor.name} gerou um novo link de acompanhamento; o link anterior foi desativado`, 'event', actor.name);
    });
    // Live streams opened with the previous key are closed immediately.
    this.events.revokeTracking(id);
    this.events.changed(id);
    return { protocol: formatProtocol(id), access_key: accessKey };
  }

  async attachment(id: number) {
    const file = await this.repo.attachment(id);
    if (!file) throw new ApiError(HttpStatus.NOT_FOUND, 'Sem anexo');
    return file;
  }

  /** Resolves a public protocol + secret key. Wrong key and unknown ticket are indistinguishable. */
  async resolvePublic(protocol: string, key: unknown): Promise<number> {
    const id = parseProtocol(protocol);
    if (id === null) throw new ApiError(HttpStatus.NOT_FOUND, NOT_FOUND);
    const hash = await this.repo.findAccessHash(id);
    if (!hash || typeof key !== 'string' || !key || key.length > 128 || !matchesDigest(hash, key)) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Chamado não encontrado ou link inválido');
    }
    return id;
  }
}
