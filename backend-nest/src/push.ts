import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import webpush from 'web-push';
import { Database } from './db';
import { exactFields, object, stringField } from './shared';

function validateEndpoint(input: unknown) {
  const data = object(input);
  exactFields(data, ['endpoint']);
  const endpoint = stringField(data, 'endpoint', 20, 2048);
  try {
    if (new URL(endpoint).protocol !== 'https:') throw new Error('HTTPS');
  } catch { throw new ServiceUnavailableException('Endpoint de notificação inválido.'); }
  return endpoint;
}
function validateSubscription(input: unknown) {
  const data = object(input);
  exactFields(data, ['endpoint', 'keys']);
  const endpoint = validateEndpoint({ endpoint: data.endpoint });
  const keys = object(data.keys);
  exactFields(keys, ['p256dh', 'auth']);
  return { endpoint, p256dh: stringField(keys, 'p256dh', 40, 256),
    auth: stringField(keys, 'auth', 8, 128) };
}
type SubscriptionRow = { id: number; endpoint: string; p256dh: string; auth: string };

@Injectable()
export class PushService {
  configured() {
    return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
  }
  constructor(private readonly db: Database) {
    if (this.configured()) webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  }
  config() {
    return { enabled: this.configured(), public_key: this.configured() ? process.env.VAPID_PUBLIC_KEY! : '' };
  }
  private requireEnabled() {
    if (!this.configured()) throw new ServiceUnavailableException('Notificações do computador ainda não foram configuradas no servidor.');
  }
  async subscribe(body: unknown, technicianId: number) {
    this.requireEnabled();
    const data = validateSubscription(body);
    await this.db.query(
      'INSERT INTO push_subscriptions (technician_id,endpoint,p256dh,auth,created_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (endpoint) DO UPDATE SET technician_id=EXCLUDED.technician_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth',
      [technicianId, data.endpoint, data.p256dh, data.auth]);
    return { ok: true };
  }
  async unsubscribe(body: unknown, technicianId: number) {
    const endpoint = validateEndpoint(body);
    await this.db.query('DELETE FROM push_subscriptions WHERE technician_id=$1 AND endpoint=$2', [technicianId, endpoint]);
    return { ok: true };
  }
  private async deliver(rows: SubscriptionRow[], payload: Record<string, unknown>) {
    const message = JSON.stringify(payload);
    await Promise.all(rows.map(async row => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, message, { TTL: 3600 });
      } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode === 404 || err.statusCode === 410)
          await this.db.query('DELETE FROM push_subscriptions WHERE id=$1', [row.id]);
        else console.warn('Temporary web push failure:', err.statusCode || 'unknown');
      }
    }));
  }
  async newTicket(ticketId: number) {
    if (!this.configured()) return;
    const ticket = await this.db.query<{ name: string; department: string; title: string; affected_system: string }>(
      'SELECT name, department, title, affected_system FROM tickets WHERE id=$1', [ticketId]);
    if (!ticket.rows[0]) return;
    const t = ticket.rows[0];
    const subscriptions = await this.db.query<SubscriptionRow>('SELECT id, endpoint, p256dh, auth FROM push_subscriptions');
    await this.deliver(subscriptions.rows, {
      title: 'Novo chamado — ' + t.department,
      body: t.name + ': ' + t.title + (t.affected_system ? ' · ' + t.affected_system : ''),
      url: '/ti?ticket=' + ticketId, tag: 'ticket-' + ticketId,
    });
  }
  async test(technicianId: number) {
    this.requireEnabled();
    const subscriptions = await this.db.query<SubscriptionRow>(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE technician_id=$1', [technicianId]);
    void this.deliver(subscriptions.rows, {
      title: 'Notificações ativadas — Givova TI',
      body: 'Este computador receberá os novos chamados.', url: '/ti', tag: 'givova-ti-test',
    }).catch(err => console.warn('Web Push:', err));
    return { ok: true };
  }
}
