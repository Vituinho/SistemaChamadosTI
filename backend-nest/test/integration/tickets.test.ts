import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import sharp from 'sharp';
import { digest } from '../../src/common/crypto';
import { Client, createTicket, skipReason, startApp, VALID_TICKET, type TestApp } from '../support/harness';

function ticketForm(fields: Record<string, string>, file?: { data: Buffer; name: string; type?: string; field?: string }) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (file) form.append(file.field ?? 'attachment', new Blob([new Uint8Array(file.data)], { type: file.type ?? 'image/png' }), file.name);
  return form;
}

describe('ticket creation, tracking and attachments', { skip: skipReason }, () => {
  let t: TestApp;
  let staff: Client;
  before(async () => {
    t = await startApp();
    await t.createTechnician('ana', 'Ana TI');
    staff = await t.login('ana');
  });
  after(() => t?.close());

  test('employee opens a ticket with JSON and receives protocol + secret tracking key', async () => {
    const created = await createTicket(t.client(), { description: null, location: undefined });
    assert.match(created.protocol, /^GV-\d{6,}$/);
    assert.equal(created.status, 'NOVO');
    assert.equal(created.priority, 'NORMAL');
    assert.equal(created.description, '');
    assert.equal(created.location, '');
    assert.equal(created.technician, null);
    assert.equal(created.history.length, 1);
    assert.match(created.history[0].message, /Chamado criado — aguardando TI — sistema: DBFrete/);
    assert.equal(created.access_key.length, 43);
    const { rows } = await t.pool.query('SELECT access_hash FROM tickets WHERE id = $1', [created.id]);
    assert.equal(rows[0].access_hash, digest(created.access_key), 'only the hash is stored');
  });

  test('server-side validation rejects invalid tickets with field names', async () => {
    const c = t.client();
    const cases: [Record<string, unknown>, string][] = [
      [{ ...VALID_TICKET, name: '' }, 'name'],
      [{ ...VALID_TICKET, department: 'Marketing' }, 'department'],
      [{ ...VALID_TICKET, affected_system: '' }, 'affected_system'],
      [{ ...VALID_TICKET, title: 'ab' }, 'title'],
      [{ ...VALID_TICKET, status: 'RESOLVIDO' }, 'status'],
      [{ ...VALID_TICKET, priority: 'URGENTE' }, 'priority'],
    ];
    for (const [body, field] of cases) {
      const res = await c.post('/tickets', body);
      assert.equal(res.status, 422, field);
      assert.ok(res.body.fields.includes(field), `${field}: ${JSON.stringify(res.body)}`);
    }
    const { rows } = await t.pool.query("SELECT COUNT(*)::int AS n FROM tickets WHERE department = 'Marketing'");
    assert.equal(rows[0].n, 0);
  });

  test('multipart upload: image is verified and re-encoded to WEBP', async () => {
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#123456' } }).png().toBuffer();
    const res = await t.client().request('POST', '/tickets', { form: ticketForm(VALID_TICKET, { data: png, name: 'print.png' }) });
    assert.equal(res.status, 201);
    assert.equal(res.body.has_attachment, true);
    const staffImage = await staff.get(`/tickets/${res.body.id}/attachment`);
    assert.equal(staffImage.status, 200);
    assert.equal(staffImage.headers.get('content-type'), 'image/webp');
    assert.match(staffImage.headers.get('content-security-policy') ?? '', /sandbox/);
    assert.equal((await sharp(staffImage.body as Buffer).metadata()).format, 'webp');
    const publicImage = await t.client().get(`/tracking/${res.body.protocol}/attachment`, { 'X-Ticket-Key': res.body.access_key });
    assert.equal(publicImage.status, 200);
    assert.equal((await t.client().get(`/tracking/${res.body.protocol}/attachment`, { 'X-Ticket-Key': 'wrong-key-wrong-key-wrong' })).status, 404);
  });

  test('multipart upload rejects disguised files, oversize files and unexpected fields', async () => {
    const c = t.client();
    const fake = await c.request('POST', '/tickets', { form: ticketForm(VALID_TICKET, { data: Buffer.from('<?php echo 1; ?>'), name: 'x.png' }) });
    assert.equal(fake.status, 422);
    assert.match(fake.body.detail, /imagem PNG, JPG ou WEBP/);
    const big = await c.request('POST', '/tickets', { form: ticketForm(VALID_TICKET, { data: Buffer.alloc(5 * 1024 * 1024 + 10), name: 'big.png' }) });
    assert.equal(big.status, 413);
    assert.equal(big.body.detail, 'A imagem deve ter até 5 MB.');
    const other = await c.request('POST', '/tickets', { form: ticketForm(VALID_TICKET, { data: Buffer.from('x'), name: 'a.txt', field: 'evil' }) });
    assert.equal(other.status, 422);
    const extra = await c.request('POST', '/tickets', { form: ticketForm({ ...VALID_TICKET, status: 'RESOLVIDO' }) });
    assert.equal(extra.status, 422);
    const { rows } = await t.pool.query('SELECT COUNT(*)::int AS n FROM attachments');
    assert.equal(rows[0].n, 1, 'no attachment stored for rejected requests');
  });

  test('tracking requires the exact key; protocol alone reveals nothing', async () => {
    const created = await createTicket(t.client());
    const c = t.client();
    assert.equal((await c.get(`/tracking/${created.protocol}`)).status, 404);
    assert.equal((await c.get(`/tracking/${created.protocol}`, { 'X-Ticket-Key': created.access_key.slice(0, -1) + 'A' })).status, 404);
    assert.equal((await c.get(`/tracking/GV-999999`, { 'X-Ticket-Key': created.access_key })).status, 404);
    assert.equal((await c.get(`/tracking/GV-1%20OR%201=1`, { 'X-Ticket-Key': created.access_key })).status, 404);
    const ok = await c.get(`/tracking/${created.protocol}`, { 'X-Ticket-Key': created.access_key });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.title, VALID_TICKET.title);
    assert.equal('access_key' in ok.body, false);
    assert.equal('access_hash' in ok.body, false);
  });

  test('every technician endpoint requires a session', async () => {
    const created = await createTicket(t.client());
    const anon = t.client();
    const requests: [string, string, unknown?][] = [
      ['GET', '/tickets'], ['GET', `/tickets/${created.id}`], ['GET', `/tickets/${created.id}/history`],
      ['GET', `/tickets/${created.id}/attachment`], ['POST', `/tickets/${created.id}/assign`],
      ['PATCH', `/tickets/${created.id}`, { priority: 'ALTA' }], ['POST', `/tickets/${created.id}/resolve`, { solution: 'feito' }],
      ['POST', `/tickets/${created.id}/notes`, { message: 'oi' }], ['POST', `/tickets/${created.id}/tracking-link`],
      ['GET', '/dashboard'], ['GET', '/events'], ['GET', '/auth/me'], ['GET', '/push/config'],
      ['POST', '/push/subscribe', {}], ['POST', '/push/unsubscribe', {}], ['POST', '/push/test'],
    ];
    for (const [method, path, json] of requests) {
      const res = await anon.request(method, path, json === undefined ? {} : { json });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
    const { rows } = await t.pool.query('SELECT status, priority FROM tickets WHERE id = $1', [created.id]);
    assert.deepEqual(rows[0], { status: 'NOVO', priority: 'NORMAL' });
  });

  test('invalid ids are rejected before touching the database', async () => {
    assert.equal((await staff.get('/tickets/abc')).status, 422);
    assert.equal((await staff.get('/tickets/0')).status, 422);
    assert.equal((await staff.get('/tickets/99999999999')).status, 422);
    assert.equal((await staff.get('/tickets/999999')).status, 404);
  });
});
