import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { ApiError } from '../common/http/api-error';
import { DatabaseService } from '../database/database.service';
import type { PushSubscriptionDto } from './push.dto';

type SubscriptionRow = { id: number; endpoint: string; p256dh: string; auth: string };

/**
 * Hosts of the browsers' push services (Chrome/Edge legacy FCM, Firefox, Edge/Windows, Safari).
 * Subscriptions are created by the browser, so any other host means a forged request; refusing
 * them prevents the API from being used to send requests to arbitrary servers.
 */
const PUSH_SERVICE_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

export function isPushServiceEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.port && !url.username && PUSH_SERVICE_HOSTS.some(host => host.test(url.hostname));
  } catch {
    return false;
  }
}
export type PushPayload = { title: string; body: string; url: string; tag: string };

/** Sender is replaceable in tests (no network). */
export type PushSender = (subscription: webpush.PushSubscription, payload: string) => Promise<unknown>;
export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** Web Push (VAPID) for TI computers, compatible with subscriptions stored by the legacy API. */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly sender: PushSender;

  constructor(
    private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUSH_SENDER) sender: PushSender | null,
  ) {
    const vapid = config.vapid;
    this.sender =
      sender ??
      ((subscription, payload) =>
        webpush.sendNotification(subscription, payload, {
          TTL: 3600,
          timeout: 10_000,
          vapidDetails: vapid ? { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey } : undefined,
        }));
  }

  get enabled() {
    return this.config.vapid !== null;
  }

  publicConfig() {
    return { enabled: this.enabled, public_key: this.config.vapid?.publicKey ?? '' };
  }

  private requireEnabled() {
    if (!this.enabled) {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'Notificações do computador ainda não foram configuradas no servidor.');
    }
  }

  async subscribe(dto: PushSubscriptionDto, technicianId: number) {
    this.requireEnabled();
    if (!isPushServiceEndpoint(dto.endpoint)) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'Serviço de notificação do navegador não reconhecido.', ['endpoint']);
    }
    await this.db.query(
      `INSERT INTO push_subscriptions (technician_id, endpoint, p256dh, auth, created_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (endpoint) DO UPDATE SET technician_id = EXCLUDED.technician_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [technicianId, dto.endpoint, dto.keys.p256dh, dto.keys.auth],
    );
    return { ok: true };
  }

  async unsubscribe(endpoint: string, technicianId: number) {
    await this.db.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND technician_id = $2', [endpoint, technicianId]);
    return { ok: true };
  }

  async sendTest(technicianId: number) {
    this.requireEnabled();
    const { rows } = await this.db.query<SubscriptionRow>(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE technician_id = $1',
      [technicianId],
    );
    void this.deliver(rows, {
      title: 'Notificações ativadas — Givova TI',
      body: 'Este computador receberá os novos chamados.',
      url: '/ti',
      tag: 'givova-ti-test',
    });
    return { ok: true };
  }

  async notifyNewTicket(ticketId: number) {
    if (!this.enabled) return;
    const ticket = await this.db.query<{ name: string; department: string; title: string; affected_system: string }>(
      'SELECT name, department, title, affected_system FROM tickets WHERE id = $1',
      [ticketId],
    );
    const t = ticket.rows[0];
    if (!t) return;
    const { rows } = await this.db.query<SubscriptionRow>('SELECT id, endpoint, p256dh, auth FROM push_subscriptions');
    await this.deliver(rows, {
      title: `Novo chamado — ${t.department}`,
      body: `${t.name}: ${t.title}${t.affected_system ? ` · ${t.affected_system}` : ''}`,
      url: `/ti?ticket=${ticketId}`,
      tag: `ticket-${ticketId}`,
    });
  }

  /** Delivers to every subscription; expired ones (404/410) are removed. Never throws. */
  async deliver(rows: SubscriptionRow[], payload: PushPayload) {
    const message = JSON.stringify(payload);
    const stale: number[] = [];
    await Promise.all(
      rows.map(async row => {
        if (!isPushServiceEndpoint(row.endpoint)) {
          this.logger.warn({ msg: 'Assinatura Web Push ignorada: host não reconhecido', subscriptionId: row.id });
          return;
        }
        try {
          await this.sender({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, message);
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) stale.push(row.id);
          else this.logger.warn({ msg: 'Falha temporária no Web Push', status: status ?? 'desconhecido' });
        }
      }),
    );
    if (stale.length) {
      await this.db
        .query('DELETE FROM push_subscriptions WHERE id = ANY($1::int[])', [stale])
        .catch(error => this.logger.warn({ msg: 'Falha ao remover assinaturas expiradas', error: (error as Error).message }));
    }
    return { delivered: rows.length - stale.length, removed: stale.length };
  }
}
