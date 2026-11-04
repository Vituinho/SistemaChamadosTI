import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { Client, createTicket, skipReason, startApp, type TestApp } from '../support/harness';

describe('ticket lifecycle', { skip: skipReason }, () => {
  let t: TestApp;
  let ana: Client;
  let bruno: Client;
  before(async () => {
    t = await startApp();
    await t.createTechnician('ana', 'Ana TI');
    await t.createTechnician('bruno', 'Bruno TI');
    ana = await t.login('ana');
    bruno = await t.login('bruno');
  });
  after(() => t?.close());

  test('employee → protocol → technician assumes → employee sees progress → resolution', async () => {
    const employee = t.client();
    const created = await createTicket(employee);
    const track = () => employee.get(`/tracking/${created.protocol}`, { 'X-Ticket-Key': created.access_key });

    const queue = await ana.get('/tickets?scope=open');
    assert.ok(queue.body.items.some((item: { id: number }) => item.id === created.id));

    const assigned = await ana.post(`/tickets/${created.id}/assign`);
    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.status, 'EM_ATENDIMENTO');
    assert.equal(assigned.body.technician, 'Ana TI');
    assert.ok(assigned.body.assigned_at);

    let seen = (await track()).body;
    assert.equal(seen.status, 'EM_ATENDIMENTO');
    assert.equal(seen.technician, 'Ana TI');

    const waiting = await ana.patch(`/tickets/${created.id}`, { status: 'AGUARDANDO_USUARIO', priority: 'ALTA' });
    assert.equal(waiting.status, 200);
    assert.equal(waiting.body.status, 'AGUARDANDO_USUARIO');
    assert.equal(waiting.body.priority, 'ALTA');

    const note = await ana.post(`/tickets/${created.id}/notes`, { message: 'Pode reiniciar o computador e me avisar?' });
    assert.equal(note.status, 201);
    seen = (await track()).body;
    const last = seen.history.at(-1);
    assert.deepEqual([last.kind, last.author, last.message], ['note', 'Ana TI', 'Pode reiniciar o computador e me avisar?']);

    assert.equal((await ana.patch(`/tickets/${created.id}`, { status: 'EM_ATENDIMENTO' })).status, 200);
    const solved = await ana.post(`/tickets/${created.id}/resolve`, { solution: 'Senha redefinida e acesso testado.' });
    assert.equal(solved.status, 200);
    assert.equal(solved.body.status, 'RESOLVIDO');
    assert.ok(solved.body.resolved_at);

    seen = (await track()).body;
    assert.equal(seen.status, 'RESOLVIDO');
    assert.equal(seen.solution, 'Senha redefinida e acesso testado.');
    const messages = seen.history.map((h: { message: string }) => h.message);
    assert.deepEqual(messages.slice(0, 2), ['Chamado criado — aguardando TI — sistema: DBFrete', 'Ana TI assumiu o chamado — status EM_ATENDIMENTO']);
    assert.ok(messages.includes('Ana TI: status EM_ATENDIMENTO → AGUARDANDO_USUARIO'));
    assert.ok(messages.includes('Ana TI: prioridade NORMAL → ALTA'));
    assert.ok(messages.includes('Ana TI resolveu o chamado — Senha redefinida e acesso testado.'));
    const ids = seen.history.map((h: { id: number }) => h.id);
    assert.deepEqual(ids, [...ids].sort((a: number, b: number) => a - b), 'history is chronological');

    // Closed tickets are final.
    assert.equal((await ana.patch(`/tickets/${created.id}`, { priority: 'URGENTE' })).status, 409);
    assert.equal((await ana.post(`/tickets/${created.id}/resolve`, { solution: 'de novo' })).status, 409);
    assert.equal((await bruno.post(`/tickets/${created.id}/assign`)).status, 409);
  });

  test('invalid transitions are refused and leave no history', async () => {
    const created = await createTicket(t.client());
    const before = (await ana.get(`/tickets/${created.id}/history`)).body.length;
    assert.equal((await ana.patch(`/tickets/${created.id}`, { status: 'AGUARDANDO_USUARIO' })).status, 409);
    assert.equal((await ana.patch(`/tickets/${created.id}`, { status: 'RESOLVIDO' })).status, 409);
    assert.equal((await ana.post(`/tickets/${created.id}/resolve`, { solution: 'feito' })).status, 409);
    assert.equal((await ana.post(`/tickets/${created.id}/resolve`, { solution: 'x' })).status, 422);
    assert.equal((await ana.get(`/tickets/${created.id}/history`)).body.length, before);
    const cancelled = await ana.patch(`/tickets/${created.id}`, { status: 'CANCELADO' });
    assert.equal(cancelled.body.status, 'CANCELADO');
    assert.equal((await ana.patch(`/tickets/${created.id}`, { status: 'EM_ATENDIMENTO' })).status, 409);
  });

  test('concurrent assignment: exactly one technician wins', async () => {
    const created = await createTicket(t.client());
    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_, i) => (i % 2 ? ana : bruno).post(`/tickets/${created.id}/assign`)),
    );
    const statuses = attempts.map(r => r.status).sort();
    assert.equal(statuses.filter(s => s === 200).length, 1, JSON.stringify(statuses));
    assert.equal(statuses.filter(s => s === 409).length, 7);
    const history = (await ana.get(`/tickets/${created.id}/history`)).body as { message: string }[];
    assert.equal(history.filter(h => h.message.includes('assumiu')).length, 1);
  });

  test('concurrent status and priority changes are serialized', async () => {
    const created = await createTicket(t.client());
    await ana.post(`/tickets/${created.id}/assign`);
    const results = await Promise.all([
      ana.patch(`/tickets/${created.id}`, { priority: 'URGENTE' }),
      bruno.patch(`/tickets/${created.id}`, { priority: 'BAIXA' }),
      ana.post(`/tickets/${created.id}/resolve`, { solution: 'Resolvido em paralelo' }),
    ]);
    assert.ok(results.every(r => r.status === 200 || r.status === 409));
    const final = (await ana.get(`/tickets/${created.id}`)).body;
    const priorityEvents = final.history.filter((h: { message: string }) => h.message.includes('prioridade'));
    // Each recorded change starts from the value left by the previous one (no lost updates).
    let current = 'NORMAL';
    for (const event of priorityEvents) {
      const [, from, to] = event.message.match(/prioridade (\w+) → (\w+)/)!;
      assert.equal(from, current);
      current = to;
    }
    assert.equal(final.priority, current);
  });

  test('a new tracking link invalidates the previous one', async () => {
    const created = await createTicket(t.client());
    const renewed = await ana.post(`/tickets/${created.id}/tracking-link`);
    assert.equal(renewed.status, 200);
    assert.equal(renewed.body.protocol, created.protocol);
    assert.notEqual(renewed.body.access_key, created.access_key);
    const c = t.client();
    assert.equal((await c.get(`/tracking/${created.protocol}`, { 'X-Ticket-Key': created.access_key })).status, 404);
    assert.equal((await c.get(`/tracking/${created.protocol}`, { 'X-Ticket-Key': renewed.body.access_key })).status, 200);
  });
});
