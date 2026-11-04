import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { Client, createTicket, skipReason, startApp, type TestApp } from '../support/harness';

describe('queue filters, pagination and dashboard metrics', { skip: skipReason }, () => {
  let t: TestApp;
  let ana: Client;
  let bruno: Client;
  let ids: number[] = [];

  before(async () => {
    t = await startApp();
    const anaId = await t.createTechnician('ana', 'Ana TI');
    await t.createTechnician('bruno', 'Bruno TI');
    ana = await t.login('ana');
    bruno = await t.login('bruno');
    const employee = t.client();
    const specs = [
      { name: 'Carlos Souza', department: 'Financeiro', category: 'Internet', affected_system: '', title: 'Sem internet 100%' },
      { name: 'Debora Lima', department: 'Logística', category: 'Sistema', affected_system: 'Frete Brás', title: 'Frete Brás fora' },
      { name: 'Eva Rocha', department: 'Faturamento', category: 'Impressora', affected_system: '', title: 'Impressora parada' },
      { name: 'Fabio Reis', department: 'Financeiro', category: 'Sistema', affected_system: 'DBFrete', title: 'DBFrete lento' },
      { name: 'Gabi Nunes', department: 'Monitoramento', category: 'E-mail', affected_system: '', title: 'Outlook não abre' },
    ];
    for (const spec of specs) ids.push((await createTicket(employee, spec)).id);
    // Deterministic timestamps relative to now (UTC), so metrics have exact expected values.
    await t.pool.query(`UPDATE tickets SET created_at = now() - make_interval(mins => (6 - id) * 60) WHERE id = ANY($1)`, [ids]);
    // #1: assigned by Ana 30 min after creation and resolved 90 min after creation.
    await t.pool.query(
      `UPDATE tickets SET status = 'RESOLVIDO', technician_id = $2, assigned_at = created_at + interval '30 minutes',
       resolved_at = created_at + interval '90 minutes', solution = 'ok' WHERE id = $1`,
      [ids[0], anaId],
    );
    // #2: assigned by Ana 10 min after creation, still open.
    await t.pool.query(
      `UPDATE tickets SET status = 'EM_ATENDIMENTO', technician_id = $2, assigned_at = created_at + interval '10 minutes' WHERE id = $1`,
      [ids[1], anaId],
    );
    await t.pool.query(`UPDATE tickets SET priority = 'URGENTE' WHERE id = $1`, [ids[4]]);
    await t.pool.query(`UPDATE tickets SET status = 'AGUARDANDO_TERCEIRO', technician_id = $2, assigned_at = created_at WHERE id = $1`, [ids[2], anaId]);
  });
  after(() => t?.close());

  test('legacy dashboard fields plus real metrics', async () => {
    const d = (await ana.get('/dashboard')).body;
    assert.equal(d.new, 2);
    assert.equal(d.active, 1);
    assert.equal(d.pending, 1);
    assert.equal(d.open, 4);
    assert.equal(d.latest_id, Math.max(...ids));
    assert.ok(d.revision >= ids.length);
    // #4 (NORMAL, 2 h old > 120 min) is overdue; #5 is URGENTE and 1 h old (> 15 min) → overdue.
    assert.equal(d.overdue, 2);
    assert.equal(d.metrics.window_days, 7);
    assert.equal(d.metrics.first_response_count, 3);
    assert.equal(d.metrics.first_response_avg_minutes, Math.round((30 + 10 + 0) / 3));
    assert.equal(d.metrics.resolution_count, 1);
    assert.equal(d.metrics.resolution_avg_minutes, 90);
    assert.deepEqual(d.workload, [{ technician_id: d.workload[0].technician_id, name: 'Ana TI', active: 2 }]);
    assert.deepEqual(d.sla_first_response_minutes, { URGENTE: 15, ALTA: 30, NORMAL: 120, BAIXA: 480 });
  });

  test('filters by status, department, system, scope and assignment', async () => {
    const q = async (query: string) => (await ana.get(`/tickets?${query}`)).body as { items: { id: number }[]; total: number };
    assert.deepEqual((await q('status=NOVO')).items.map(i => i.id), [ids[3], ids[4]]);
    assert.equal((await q('department=Financeiro')).total, 2);
    assert.deepEqual((await q('affected_system=Frete%20Br%C3%A1s')).items.map(i => i.id), [ids[1]]);
    assert.equal((await q('scope=open')).total, 4);
    assert.deepEqual((await q('scope=closed')).items.map(i => i.id), [ids[0]]);
    assert.equal((await q('assigned=me&scope=open')).total, 2);
    assert.equal((await bruno.get('/tickets?assigned=me')).body.total, 0);
    assert.deepEqual((await q('assigned=none')).items.map(i => i.id), [ids[3], ids[4]]);
    assert.equal((await q('status=NOVO&department=Monitoramento')).total, 1);
  });

  test('search by protocol, number, name and literal wildcard characters', async () => {
    const q = async (term: string) => (await ana.get(`/tickets?q=${encodeURIComponent(term)}`)).body as { items: { id: number }[] };
    const protocol = 'GV-' + String(ids[2]).padStart(6, '0');
    assert.deepEqual((await q(protocol)).items.map(i => i.id), [ids[2]]);
    assert.deepEqual((await q(`#${ids[2]}`)).items.map(i => i.id), [ids[2]]);
    assert.deepEqual((await q('debora')).items.map(i => i.id), [ids[1]]);
    assert.deepEqual((await q('100%')).items.map(i => i.id), [ids[0]], '% is matched literally');
    assert.deepEqual((await q('_')).items, [], '_ is matched literally');
    assert.deepEqual((await q("'; DROP TABLE tickets; --")).items, []);
    assert.equal((await ana.get('/tickets')).body.total, 5);
  });

  test('pagination and sorting', async () => {
    const page1 = (await ana.get('/tickets?limit=2&offset=0')).body;
    const page2 = (await ana.get('/tickets?limit=2&offset=2')).body;
    const page3 = (await ana.get('/tickets?limit=2&offset=4')).body;
    assert.equal(page1.total, 5);
    assert.deepEqual([...page1.items, ...page2.items, ...page3.items].map((i: { id: number }) => i.id), ids, 'oldest first by default');
    assert.deepEqual((await ana.get('/tickets?sort=newest&limit=1')).body.items[0].id, ids[4]);
    assert.deepEqual((await ana.get('/tickets?sort=priority&limit=1')).body.items[0].id, ids[4]);
    assert.ok((await ana.get('/tickets?sort=activity')).body.items.length === 5);
  });

  test('invalid query parameters return 422', async () => {
    for (const query of ['status=ABERTO', 'limit=101', 'limit=0', 'offset=-1', 'sort=random', 'scope=x', 'assigned=99', 'foo=bar']) {
      assert.equal((await ana.get(`/tickets?${query}`)).status, 422, query);
    }
  });
});
