import {
  BadRequestException, ConflictException, Controller, Get, Headers, Injectable, NotFoundException, Patch, Post,
  Query, Req, Res, ServiceUnavailableException, UploadedFile, UseGuards, UseInterceptors,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { PoolClient } from 'pg';
import sharp from 'sharp';
import { Database } from './db';
import { AuthRequest, TechnicianGuard } from './auth';
import { PushService } from './push';
import {
  digest, equalDigest, failValidation, protocolId, stringField, transitions, utcStamp,
  validId, validateResolution, validateTicket, validateUpdate, Status,
} from './shared';

type TicketRow = {
  id: number; access_hash: string; name: string; department: string; state: string;
  location: string; category: string; affected_system: string; title: string;
  description: string; status: Status; priority: string; technician: string | null;
  technician_id: number | null; created_at: Date; assigned_at: Date | null;
  resolved_at: Date | null; solution: string | null; has_attachment: boolean;
};
const baseTicketSQL = 'SELECT t.*, u.name AS technician, EXISTS (SELECT 1 FROM attachments a WHERE a.ticket_id = t.id) AS has_attachment FROM tickets t LEFT JOIN technicians u ON t.technician_id = u.id';

function serializeTicket(ticket: TicketRow) {
  return {
    id: ticket.id, protocol: 'GV-' + String(ticket.id).padStart(6, '0'),
    name: ticket.name, department: ticket.department, state: ticket.state, location: ticket.location,
    category: ticket.category, affected_system: ticket.affected_system,
    title: ticket.title, status: ticket.status, priority: ticket.priority,
    technician: ticket.technician || null, created_at: utcStamp(ticket.created_at),
    assigned_at: utcStamp(ticket.assigned_at), resolved_at: utcStamp(ticket.resolved_at),
  };
}
async function imageData(buffer: Buffer): Promise<Buffer> {
  if (buffer.length > 5 * 1024 * 1024) throw new BadRequestException('A imagem deve ter até 5 MB.');
  try {
    const details = await sharp(buffer, { limitInputPixels: 16_000_000, animated: false }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(details.format || '')
        || !details.width || !details.height || details.width * details.height > 16_000_000
        || (details.pages && details.pages !== 1)) throw new Error('Unsupported image');
    return await sharp(buffer, { limitInputPixels: 16_000_000 }).rotate().webp({ quality: 85 }).toBuffer();
  } catch {
    throw new UnprocessableEntityException('Envie uma imagem PNG, JPG ou WEBP válida, de até 16 megapixels.');
  }
}
@Injectable()
export class TicketsService {
  constructor(private readonly db: Database, private readonly push: PushService) {}

  private async findRow(id: number, client: Database['pool'] | PoolClient = this.db.pool, lock = false): Promise<TicketRow> {
    const { rows } = await client.query<TicketRow>(
      baseTicketSQL + ' WHERE t.id = $1' + (lock ? ' FOR UPDATE OF t' : ''), [id]);
    if (!rows[0]) throw new NotFoundException('Chamado não encontrado');
    return rows[0];
  }
  async detail(id: number) {
    const ticket = await this.findRow(id);
    const { rows } = await this.db.query<{ id: number; message: string; created_at: Date }>(
      'SELECT id, message, created_at FROM ticket_history WHERE ticket_id = $1 ORDER BY id', [id]);
    return { ...serializeTicket(ticket), description: ticket.description, solution: ticket.solution,
      has_attachment: ticket.has_attachment,
      history: rows.map(r => ({ id: r.id, message: r.message, created_at: utcStamp(r.created_at) })) };
  }
  async create(body: unknown, attachment?: Express.Multer.File) {
    const data = validateTicket(body);
    const image = attachment ? await imageData(attachment.buffer) : null;
    const accessKey = randomBytes(32).toString('base64url');
    const id = await this.db.transaction(async client => {
      const result = await client.query<{ id: number }>(
        'INSERT INTO tickets(access_hash,name,department,state,location,category,affected_system,title,description,status,priority,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) RETURNING id',
        [digest(accessKey), data.name, data.department, data.state, data.location, data.category,
          data.affected_system, data.title, data.description, 'NOVO', 'NORMAL']);
      const ticketId = result.rows[0].id;
      const suffix = data.affected_system ? ' — sistema: ' + data.affected_system : '';
      await client.query('INSERT INTO ticket_history(ticket_id,message,created_at) VALUES ($1,$2,now())',
        [ticketId, 'Chamado criado — aguardando TI' + suffix]);
      if (image) await client.query('INSERT INTO attachments(ticket_id,mime,data) VALUES ($1,$2,$3)', [ticketId, 'image/webp', image]);
      return ticketId;
    });
    const result = await this.detail(id);
    void this.push.newTicket(id).catch(err => console.warn('Web Push:', err));
    return { ...result, access_key: accessKey };
  }

  async list(query: Record<string, unknown>) {
    const fields = ['status', 'department', 'state', 'category', 'affected_system', 'priority'] as const;
    const clauses: string[] = [];
    const values: unknown[] = [];
    for (const key of fields) {
      const value = query[key];
      if (value != null && value !== '') {
        if (typeof value !== 'string' || value.length > 160) failValidation();
        values.push(value);
        clauses.push('t.' + key + ' = $' + values.length);
      }
    }
    const q = query.q === undefined ? '' : query.q;
    if (typeof q !== 'string' || q.length > 160) failValidation();
    if (q.trim()) {
      const search = q.trim();
      const escaped = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
      values.push(escaped);
      const n = values.length;
      const terms = ['name', 'title', 'description', 'state', 'location', 'affected_system']
        .map(col => 't.' + col + ' ILIKE $' + n + " ESCAPE '\\' ");
      const code = search.replace(/^#/, '').toUpperCase().replace(/^GV-/, '');
      if (/^[0-9]{1,11}$/.test(code)) {
        values.push(Number(code));
        terms.push('t.id = $' + values.length);
      }
      clauses.push('(' + terms.join(' OR ') + ')');
    }
    const offset = query.offset === undefined ? 0 : Number(query.offset);
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) failValidation();
    const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
    const count = await this.db.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM tickets t' + where, values);
    const items = await this.db.query<TicketRow>(
      baseTicketSQL + where + ' ORDER BY t.created_at, t.id OFFSET $' + (values.length + 1) + ' LIMIT $' + (values.length + 2),
      [...values, offset, limit]);
    return { items: items.rows.map(serializeTicket), total: Number(count.rows[0].total) };
  }
  async dashboard() {
    const { rows } = await this.db.query<{ status: Status; count: string }>('SELECT status, COUNT(*)::text AS count FROM tickets GROUP BY status');
    const counts = Object.fromEntries(rows.map(r => [r.status, Number(r.count)]));
    const result = await this.db.query<{ resolved_today: string; latest_id: number }>(
      "SELECT COUNT(*) FILTER (WHERE status = 'RESOLVIDO' AND resolved_at >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))::text AS resolved_today, COALESCE(MAX(id), 0) AS latest_id FROM tickets");
    // PostgreSQL: the count's ::text cast must apply to the whole FILTER aggregate.
    return { new: counts.NOVO || 0, active: counts.EM_ATENDIMENTO || 0,
      pending: (counts.AGUARDANDO_USUARIO || 0) + (counts.AGUARDANDO_TERCEIRO || 0),
      resolved_today: Number(result.rows[0].resolved_today), latest_id: result.rows[0].latest_id };
  }
  async history(id: number) { return (await this.detail(id)).history; }
  async assign(id: number, tech: { id: number; name: string }) {
    await this.db.transaction(async client => {
      const ticket = await this.findRow(id, client, true);
      if (ticket.status !== 'NOVO' || ticket.technician_id !== null)
        throw new ConflictException('Este chamado já foi assumido ou encerrado.');
      await client.query("UPDATE tickets SET technician_id=$1, assigned_at=now(), status='EM_ATENDIMENTO' WHERE id=$2", [tech.id, id]);
      await client.query('INSERT INTO ticket_history(ticket_id,message,created_at) VALUES ($1,$2,now())',
        [id, tech.name + ' assumiu o chamado — status EM_ATENDIMENTO']);
    });
    return this.detail(id);
  }
  async update(id: number, body: unknown, tech: { id: number; name: string }) {
    const changes = validateUpdate(body);
    await this.db.transaction(async client => {
      const ticket = await this.findRow(id, client, true);
      if (ticket.status === 'RESOLVIDO' || ticket.status === 'CANCELADO')
        throw new ConflictException('Chamados encerrados não podem ser alterados.');
      if (changes.status && changes.status !== ticket.status) {
        if (!transitions[ticket.status].includes(changes.status))
          throw new ConflictException('Transição inválida. Use assumir ou resolver quando apropriado.');
        await client.query('UPDATE tickets SET status = $1 WHERE id = $2', [changes.status, id]);
        await client.query('INSERT INTO ticket_history(ticket_id,message,created_at) VALUES ($1,$2,now())',
          [id, tech.name + ': status ' + ticket.status + ' → ' + changes.status]);
      }
      if (changes.priority && changes.priority !== ticket.priority) {
        await client.query('UPDATE tickets SET priority = $1 WHERE id = $2', [changes.priority, id]);
        await client.query('INSERT INTO ticket_history(ticket_id,message,created_at) VALUES ($1,$2,now())',
          [id, tech.name + ': prioridade ' + ticket.priority + ' → ' + changes.priority]);
      }
    });
    return this.detail(id);
  }
  async resolve(id: number, body: unknown, tech: { id: number; name: string }) {
    const { solution } = validateResolution(body);
    await this.db.transaction(async client => {
      const ticket = await this.findRow(id, client, true);
      if (!['EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'AGUARDANDO_TERCEIRO'].includes(ticket.status))
        throw new ConflictException('Assuma o chamado antes de resolver; chamados encerrados não podem ser resolvidos novamente.');
      await client.query("UPDATE tickets SET status='RESOLVIDO', resolved_at=now(), solution=$1 WHERE id=$2", [solution, id]);
      await client.query('INSERT INTO ticket_history(ticket_id,message,created_at) VALUES ($1,$2,now())',
        [id, tech.name + ' resolveu o chamado — ' + solution]);
    });
    return this.detail(id);
  }
  private async publicId(protocol: string, key: string | undefined) {
    const id = protocolId(protocol);
    if (id === null) throw new NotFoundException('Chamado não encontrado');
    const { rows } = await this.db.query<{ access_hash: string }>('SELECT access_hash FROM tickets WHERE id = $1', [id]);
    if (!rows[0] || !key || !equalDigest(rows[0].access_hash, key))
      throw new NotFoundException('Chamado não encontrado ou link inválido');
    return id;
  }
  async tracking(protocol: string, key?: string) { return this.detail(await this.publicId(protocol, key)); }
  async attachment(id: number) {
    const { rows } = await this.db.query<{ mime: string; data: Buffer }>(
      'SELECT mime, data FROM attachments WHERE ticket_id=$1', [id]);
    if (!rows[0]) throw new NotFoundException('Sem anexo');
    return rows[0];
  }
  async trackingAttachment(protocol: string, key?: string) { return this.attachment(await this.publicId(protocol, key)); }
  async revisions(res: Response, sessionToken?: string, ticketId?: number) {
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive',
    });
    res.flushHeaders();
    let previous: number | null = null;
    let busy = false;
    const poll = async () => {
      if (busy || res.destroyed || res.writableEnded) return;
      busy = true;
      try {
        if (sessionToken) {
          const session = await this.db.query('SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at > now()', [digest(sessionToken)]);
          if (!session.rowCount) { res.write('event: expired\ndata: {}\n\n'); res.end(); return; }
        }
        const result = await this.db.query<{ revision: number }>(
          'SELECT COALESCE(MAX(id), 0)::int AS revision FROM ticket_history' +
            (ticketId ? ' WHERE ticket_id = $1' : ''), ticketId ? [ticketId] : []);
        const revision = result.rows[0].revision;
        if (previous !== revision) res.write('event: update\ndata: ' + JSON.stringify({ revision }) + '\n\n');
        else res.write(': keepalive\n\n');
        previous = revision;
      } catch (err) {
        console.error('Event stream query failed', err);
        res.end();
      } finally { busy = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    res.on('close', () => clearInterval(timer));
  }
  async trackingEvents(protocol: string, key: string | undefined, res: Response) {
    return this.revisions(res, undefined, await this.publicId(protocol, key));
  }
}
@Controller()
export class TicketsController {
  constructor(private readonly service: TicketsService) {}

  @Post('tickets')
  @UseInterceptors(FileInterceptor('attachment', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8, fieldSize: 6 * 1024 * 1024 } }))
  async create(@Req() req: Request, @UploadedFile() attachment?: Express.Multer.File) {
    return this.service.create(req.body, attachment);
  }
  @Get('tickets')
  @UseGuards(TechnicianGuard)
  async list(@Query() params: Record<string, unknown>) { return this.service.list(params); }
  @Get('dashboard')
  @UseGuards(TechnicianGuard)
  async dashboard() { return this.service.dashboard(); }
  @Get('tickets/:id')
  @UseGuards(TechnicianGuard)
  async detail(@Req() req: Request) { return this.service.detail(validId(req.params.id as string)); }
  @Get('tickets/:id/history')
  @UseGuards(TechnicianGuard)
  async history(@Req() req: Request) { return this.service.history(validId(req.params.id as string)); }
  @Post('tickets/:id/assign')
  @UseGuards(TechnicianGuard)
  async assign(@Req() req: AuthRequest) { return this.service.assign(validId(req.params.id as string), req.technician!); }
  @Patch('tickets/:id')
  @UseGuards(TechnicianGuard)
  async update(@Req() req: AuthRequest) { return this.service.update(validId(req.params.id as string), req.body, req.technician!); }
  @Post('tickets/:id/resolve')
  @UseGuards(TechnicianGuard)
  async resolve(@Req() req: AuthRequest) { return this.service.resolve(validId(req.params.id as string), req.body, req.technician!); }
  @Get('tickets/:id/attachment')
  @UseGuards(TechnicianGuard)
  async attachment(@Req() req: AuthRequest, @Res() res: Response) {
    const file = await this.service.attachment(validId(req.params.id as string));
    res.set('Content-Type', file.mime).set('Content-Disposition', 'inline; filename="anexo.webp"').send(file.data);
  }
  @Get('tracking/:protocol')
  async tracking(@Req() req: Request, @Headers('x-ticket-key') key?: string) {
    return this.service.tracking(req.params.protocol as string, key);
  }
  @Get('tracking/:protocol/attachment')
  async publicAttachment(@Req() req: Request, @Headers('x-ticket-key') key: string | undefined, @Res() res: Response) {
    const file = await this.service.trackingAttachment(req.params.protocol as string, key);
    res.set('Content-Type', file.mime).set('Content-Disposition', 'inline; filename="anexo.webp"').send(file.data);
  }
  @Get('events')
  @UseGuards(TechnicianGuard)
  async events(@Req() req: AuthRequest, @Res() res: Response) { await this.service.revisions(res, req.sessionToken); }
  @Get('tracking/:protocol/events')
  async trackingEvents(@Req() req: Request, @Headers('x-ticket-key') key: string | undefined, @Res() res: Response) {
    await this.service.trackingEvents(req.params.protocol as string, key, res);
  }
}
