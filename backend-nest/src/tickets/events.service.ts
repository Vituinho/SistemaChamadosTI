import { HttpStatus, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Response } from 'express';
import { ApiError } from '../common/http/api-error';
import { DatabaseService } from '../database/database.service';

interface Client {
  res: Response;
  ticketId?: number;
  sessionHash?: string;
  sent?: number;
}

const POLL_MS = 2_000;
const KEEPALIVE_MS = 15_000;
const SESSION_CHECK_MS = 10_000;
const MAX_CLIENTS = 500;

/**
 * Server-Sent Events hub. Instead of one database poll per connection, a single
 * ticker reads the latest history revision for all subscribers (one or two
 * queries every 2 s regardless of how many browsers are connected). Writes made
 * by this process trigger an immediate tick; writes made elsewhere (another
 * instance or the legacy API during rollback) are picked up by the ticker.
 */
@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly clients = new Set<Client>();
  private timer?: NodeJS.Timeout;
  private immediate?: NodeJS.Timeout;
  private ticking = false;
  private lastKeepalive = Date.now();
  private lastSessionCheck = Date.now();

  constructor(private readonly db: DatabaseService) {}

  subscribe(res: Response, scope: { ticketId?: number; sessionHash?: string }) {
    if (this.clients.size >= MAX_CLIENTS) {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'Muitas conexões abertas. A página continuará atualizando periodicamente.');
    }
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    const client: Client = { res, ...scope };
    this.clients.add(client);
    res.on('close', () => {
      this.clients.delete(client);
      if (!this.clients.size) this.stop();
    });
    this.start();
    this.changed();
  }

  /** Called after a local write: deliver updates without waiting for the next tick. */
  changed(_ticketId?: number) {
    if (!this.clients.size || this.immediate) return;
    this.immediate = setTimeout(() => {
      this.immediate = undefined;
      void this.tick();
    }, 50);
  }

  /** Ends every public tracking stream of a ticket (its access key was replaced). */
  revokeTracking(ticketId: number) {
    for (const client of [...this.clients]) {
      if (client.ticketId !== ticketId) continue;
      this.send(client, 'event: expired\ndata: {}\n\n');
      client.res.end();
      this.clients.delete(client);
    }
    if (!this.clients.size) this.stop();
  }

  private start() {
    this.timer ??= setInterval(() => void this.tick(), POLL_MS);
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private send(client: Client, payload: string) {
    if (!client.res.writableEnded && !client.res.destroyed) client.res.write(payload);
  }

  private async tick() {
    if (this.ticking || !this.clients.size) return;
    this.ticking = true;
    try {
      const now = Date.now();
      const clients = [...this.clients];
      if (now - this.lastSessionCheck >= SESSION_CHECK_MS) {
        this.lastSessionCheck = now;
        await this.expireSessions(clients.filter(c => c.sessionHash));
      }
      const global = (await this.db.query<{ revision: number }>('SELECT COALESCE(MAX(id), 0)::int AS revision FROM ticket_history')).rows[0].revision;
      const ticketIds = [...new Set(clients.map(c => c.ticketId).filter((id): id is number => id !== undefined))];
      const perTicket = new Map<number, number>();
      if (ticketIds.length) {
        const { rows } = await this.db.query<{ ticket_id: number; revision: number }>(
          'SELECT ticket_id, MAX(id)::int AS revision FROM ticket_history WHERE ticket_id = ANY($1::int[]) GROUP BY ticket_id',
          [ticketIds],
        );
        for (const row of rows) perTicket.set(row.ticket_id, row.revision);
      }
      for (const client of this.clients) {
        const revision = client.ticketId !== undefined ? (perTicket.get(client.ticketId) ?? 0) : global;
        if (client.sent !== revision) {
          client.sent = revision;
          this.send(client, `event: update\ndata: ${JSON.stringify({ revision })}\n\n`);
        }
      }
      if (now - this.lastKeepalive >= KEEPALIVE_MS) {
        this.lastKeepalive = now;
        for (const client of this.clients) this.send(client, ': keepalive\n\n');
      }
    } catch (error) {
      this.logger.warn({ msg: 'Falha ao consultar revisões de eventos', error: (error as Error).message });
    } finally {
      this.ticking = false;
    }
  }

  private async expireSessions(staff: Client[]) {
    if (!staff.length) return;
    const hashes = [...new Set(staff.map(c => c.sessionHash!))];
    const { rows } = await this.db.query<{ token_hash: string }>(
      'SELECT token_hash FROM sessions WHERE token_hash = ANY($1::text[]) AND expires_at > now()',
      [hashes],
    );
    const active = new Set(rows.map(r => r.token_hash));
    for (const client of staff) {
      if (!active.has(client.sessionHash!)) {
        this.send(client, 'event: expired\ndata: {}\n\n');
        client.res.end();
        this.clients.delete(client);
      }
    }
  }

  /** Ends every stream (shutdown). Clients reconnect to another instance automatically. */
  closeAll() {
    this.stop();
    for (const client of this.clients) client.res.end();
    this.clients.clear();
  }

  onModuleDestroy() {
    this.stop();
    if (this.immediate) clearTimeout(this.immediate);
    for (const client of this.clients) client.res.end();
    this.clients.clear();
  }
}
