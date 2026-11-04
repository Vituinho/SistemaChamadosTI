import { Injectable } from '@nestjs/common';
import { OPEN_STATUSES, CLOSED_STATUSES, type Priority, type Status } from '../common/catalog';
import { DatabaseService, type Queryable } from '../database/database.service';
import { SchemaService } from '../database/schema.service';
import type { ListTicketsQuery } from './dto/ticket.dto';
import type { HistoryRow, TicketRow } from './ticket.types';

const TICKET_COLUMNS = `
  t.id, t.access_hash, t.name, t.department, t.state, t.location, t.category, t.affected_system,
  t.title, t.description, t.status, t.priority, t.technician_id, u.name AS technician,
  t.created_at, t.assigned_at, t.resolved_at, t.solution,
  EXISTS (SELECT 1 FROM attachments a WHERE a.ticket_id = t.id) AS has_attachment,
  (SELECT MAX(h.created_at) FROM ticket_history h WHERE h.ticket_id = t.id) AS last_activity_at`;
const FROM = 'FROM tickets t LEFT JOIN technicians u ON u.id = t.technician_id';

const ORDER_BY: Record<string, string> = {
  oldest: 't.created_at ASC, t.id ASC',
  newest: 't.created_at DESC, t.id DESC',
  priority: "CASE t.priority WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END, t.created_at ASC, t.id ASC",
  activity: 'last_activity_at DESC NULLS LAST, t.id DESC',
};

export interface NewTicket {
  accessHash: string;
  name: string;
  department: string;
  state: string;
  location: string;
  category: string;
  affectedSystem: string;
  title: string;
  description: string;
}

/** All SQL for tickets lives here. Every value is passed as a bind parameter. */
@Injectable()
export class TicketsRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly schema: SchemaService,
  ) {}

  async findById(id: number, client: Queryable = this.db.pool, lock = false): Promise<TicketRow | null> {
    if (lock) {
      // Lock only the ticket row; joins are read afterwards in the same transaction.
      await client.query('SELECT id FROM tickets WHERE id = $1 FOR UPDATE', [id]);
    }
    const { rows } = await client.query<TicketRow>(`SELECT ${TICKET_COLUMNS} ${FROM} WHERE t.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findAccessHash(id: number): Promise<string | null> {
    const { rows } = await this.db.query<{ access_hash: string }>('SELECT access_hash FROM tickets WHERE id = $1', [id]);
    return rows[0]?.access_hash ?? null;
  }

  async history(ticketId: number, client: Queryable = this.db.pool): Promise<HistoryRow[]> {
    const extra = this.schema.historyKind ? 'kind, author_name' : `'event'::text AS kind, NULL::text AS author_name`;
    const { rows } = await client.query<HistoryRow>(
      `SELECT id, message, created_at, ${extra} FROM ticket_history WHERE ticket_id = $1 ORDER BY id`,
      [ticketId],
    );
    return rows;
  }

  async insert(client: Queryable, data: NewTicket): Promise<number> {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO tickets (access_hash, name, department, state, location, category, affected_system, title, description, status, priority, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'NOVO', 'NORMAL', now()) RETURNING id`,
      [data.accessHash, data.name, data.department, data.state, data.location, data.category, data.affectedSystem, data.title, data.description],
    );
    return rows[0].id;
  }

  async addHistory(client: Queryable, ticketId: number, message: string, kind: 'event' | 'note' = 'event', author: string | null = null) {
    if (this.schema.historyKind) {
      await client.query(
        'INSERT INTO ticket_history (ticket_id, message, created_at, kind, author_name) VALUES ($1, $2, now(), $3, $4)',
        [ticketId, message, kind, author],
      );
    } else {
      await client.query('INSERT INTO ticket_history (ticket_id, message, created_at) VALUES ($1, $2, now())', [ticketId, message]);
    }
  }

  async insertAttachment(client: Queryable, ticketId: number, data: Buffer) {
    await client.query('INSERT INTO attachments (ticket_id, mime, data) VALUES ($1, $2, $3)', [ticketId, 'image/webp', data]);
  }

  async attachment(ticketId: number): Promise<{ mime: string; data: Buffer } | null> {
    const { rows } = await this.db.query<{ mime: string; data: Buffer }>('SELECT mime, data FROM attachments WHERE ticket_id = $1', [ticketId]);
    return rows[0] ?? null;
  }

  async assign(client: Queryable, ticketId: number, technicianId: number) {
    await client.query("UPDATE tickets SET technician_id = $1, assigned_at = now(), status = 'EM_ATENDIMENTO' WHERE id = $2", [technicianId, ticketId]);
  }

  async setStatus(client: Queryable, ticketId: number, status: Status) {
    await client.query('UPDATE tickets SET status = $1 WHERE id = $2', [status, ticketId]);
  }

  async setPriority(client: Queryable, ticketId: number, priority: Priority) {
    await client.query('UPDATE tickets SET priority = $1 WHERE id = $2', [priority, ticketId]);
  }

  async resolve(client: Queryable, ticketId: number, solution: string) {
    await client.query("UPDATE tickets SET status = 'RESOLVIDO', resolved_at = now(), solution = $1 WHERE id = $2", [solution, ticketId]);
  }

  async setAccessHash(client: Queryable, ticketId: number, accessHash: string) {
    await client.query('UPDATE tickets SET access_hash = $1 WHERE id = $2', [accessHash, ticketId]);
  }

  async list(query: ListTicketsQuery, technicianId: number): Promise<{ rows: TicketRow[]; total: number }> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    for (const field of ['status', 'priority', 'department', 'state', 'category', 'affected_system'] as const) {
      const value = query[field];
      if (value) clauses.push(`t.${field} = ${bind(value)}`);
    }
    if (query.scope === 'open') clauses.push(`t.status = ANY(${bind(OPEN_STATUSES)})`);
    if (query.scope === 'closed') clauses.push(`t.status = ANY(${bind(CLOSED_STATUSES)})`);
    if (query.assigned === 'me') clauses.push(`t.technician_id = ${bind(technicianId)}`);
    if (query.assigned === 'none') clauses.push('t.technician_id IS NULL');
    const search = query.q.trim();
    if (search) {
      const pattern = bind('%' + search.replace(/[\\%_]/g, '\\$&') + '%');
      const terms = ['name', 'title', 'description', 'state', 'location', 'affected_system', 'department', 'category'].map(
        column => `t.${column} ILIKE ${pattern}`,
      );
      const code = search.replace(/^#/, '').toUpperCase().replace(/^GV-/, '');
      if (/^\d{1,9}$/.test(code)) terms.push(`t.id = ${bind(Number(code))}`);
      clauses.push(`(${terms.join(' OR ')})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const order = ORDER_BY[query.sort ?? 'oldest'];
    const filterValues = [...values];
    const page = `OFFSET ${bind(query.offset)} LIMIT ${bind(query.limit)}`;
    const [count, items] = await Promise.all([
      this.db.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM tickets t ${where}`, filterValues),
      this.db.query<TicketRow>(`SELECT ${TICKET_COLUMNS} ${FROM} ${where} ORDER BY ${order} ${page}`, values),
    ]);
    return { rows: items.rows, total: Number(count.rows[0].total) };
  }
}
