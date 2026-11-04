import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { Client, createTicket, ORIGIN, skipReason, startApp, type TestApp } from '../support/harness';

const keys = { p256dh: 'B' + 'A'.repeat(86), auth: 'abcdefghijklmnopqrstuv' };

/** Reads SSE events until `count` "update" events arrive or the timeout expires. */
async function readEvents(url: string, headers: Record<string, string>, count: number, action?: () => Promise<unknown>, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, { headers, signal: controller.signal });
  const events: string[] = [];
  try {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let triggered = false;
    while (events.filter(e => e === 'update').length < count) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const name = chunk.match(/^event: (\w+)/m)?.[1];
        if (name) events.push(name);
      }
      if (!triggered && events.includes('update') && action) {
        triggered = true;
        await action();
      }
    }
  } catch {
    // aborted by timeout
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return { status: res.status, type: res.headers.get('content-type'), events };
}

describe('Web Push and real-time events', { skip: skipReason }, () => {
  let t: TestApp;
  let ana: Client;
  before(async () => {
    t = await startApp();
    await t.createTechnician('ana', 'Ana TI');
    ana = await t.login('ana');
  });
  after(() => t?.close());

  test('subscription validation and storage', async () => {
    const config = (await ana.get('/push/config')).body;
    assert.equal(config.enabled, true);
    assert.ok(config.public_key.length > 40);
    assert.equal((await ana.post('/push/subscribe', { endpoint: 'http://push.example.com/abc123456789', keys })).status, 422);
    assert.equal((await ana.post('/push/subscribe', { endpoint: 'https://push.example.com/abc123456789' })).status, 422);
    assert.equal((await ana.post('/push/subscribe', { endpoint: 'https://push.example.com/ok/1234567890', keys })).status, 200);
    assert.equal((await ana.post('/push/subscribe', { endpoint: 'https://push.example.com/gone/123456789', keys })).status, 200);
    const { rows } = await t.pool.query('SELECT COUNT(*)::int AS n FROM push_subscriptions');
    assert.equal(rows[0].n, 2);
  });

  test('a new ticket notifies subscribed computers and prunes expired subscriptions', async () => {
    t.pushes.length = 0;
    const created = await createTicket(t.client(), { name: 'Helena', title: 'Monitor sem imagem', category: 'Equipamento', affected_system: '' });
    for (let i = 0; i < 50 && t.pushes.length < 2; i++) await new Promise(r => setTimeout(r, 20));
    assert.equal(t.pushes.length, 2);
    assert.deepEqual(t.pushes[0].payload, {
      title: 'Novo chamado — Financeiro',
      body: 'Helena: Monitor sem imagem',
      url: `/ti?ticket=${created.id}`,
      tag: `ticket-${created.id}`,
    });
    for (let i = 0; i < 50; i++) {
      const { rows } = await t.pool.query('SELECT endpoint FROM push_subscriptions');
      if (rows.length === 1) break;
      await new Promise(r => setTimeout(r, 20));
    }
    const { rows } = await t.pool.query('SELECT endpoint FROM push_subscriptions');
    assert.deepEqual(rows.map(r => r.endpoint), ['https://push.example.com/ok/1234567890']);
  });

  test('test notification and unsubscribe only affect the current technician', async () => {
    t.pushes.length = 0;
    assert.equal((await ana.post('/push/test')).status, 200);
    for (let i = 0; i < 50 && !t.pushes.length; i++) await new Promise(r => setTimeout(r, 20));
    assert.equal(t.pushes[0].payload.tag, 'givova-ti-test');
    assert.equal((await ana.post('/push/unsubscribe', { endpoint: 'https://push.example.com/ok/1234567890' })).status, 200);
    const { rows } = await t.pool.query('SELECT COUNT(*)::int AS n FROM push_subscriptions');
    assert.equal(rows[0].n, 0);
  });

  test('technician event stream pushes an update when a ticket changes', async () => {
    const result = await readEvents(`${t.base}/events`, { Cookie: ana.cookie }, 2, () => createTicket(t.client()));
    assert.equal(result.status, 200);
    assert.match(result.type ?? '', /text\/event-stream/);
    assert.ok(result.events.filter(e => e === 'update').length >= 2, JSON.stringify(result.events));
  });

  test('tracking stream requires the key and reports changes to that ticket', async () => {
    const created = await createTicket(t.client());
    const denied = await fetch(`${t.base}/tracking/${created.protocol}/events`, { headers: { 'X-Ticket-Key': 'x'.repeat(43) } });
    assert.equal(denied.status, 404);
    const result = await readEvents(
      `${t.base}/tracking/${created.protocol}/events`,
      { 'X-Ticket-Key': created.access_key },
      2,
      () => ana.post(`/tickets/${created.id}/assign`),
    );
    assert.ok(result.events.filter(e => e === 'update').length >= 2, JSON.stringify(result.events));
  });

  test('stream ends with "expired" when the session is revoked', async () => {
    const bia = await t.createTechnician('bia', 'Bia').then(() => t.login('bia'));
    const result = await readEvents(`${t.base}/events`, { Cookie: bia.cookie, Origin: ORIGIN }, 99, async () => {
      await t.pool.query('DELETE FROM sessions WHERE technician_id = (SELECT id FROM technicians WHERE username = $1)', ['bia']);
    }, 15_000);
    assert.ok(result.events.includes('expired'), JSON.stringify(result.events));
  });
});
