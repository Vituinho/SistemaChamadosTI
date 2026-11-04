import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { inspectSchema, migrate, MigrationError, MIGRATIONS_DIR } from '../../src/database/migrator';
import { createSchema, createTicket, skipReason, startApp } from '../support/harness';

const baseline = readFileSync(join(MIGRATIONS_DIR, '0000_baseline.sql'), 'utf8');

describe('database migrations and legacy compatibility', { skip: skipReason }, () => {
  test('empty database: baseline + additive migrations, then idempotent', async () => {
    const db = await createSchema();
    try {
      const first = await migrate(db.pool);
      assert.deepEqual(first.applied, ['0000_baseline', '0006_history_kind_and_indexes']);
      const second = await migrate(db.pool);
      assert.deepEqual(second.applied, []);
      const state = await inspectSchema(db.pool);
      assert.equal(state.legacyVersion, '0005');
      assert.equal(state.historyKind, true);
      assert.deepEqual(state.pending, []);
    } finally {
      await db.drop();
    }
  });

  test('existing Alembic 0005 database: baseline skipped, data preserved', async () => {
    const db = await createSchema();
    try {
      // Simulate production: legacy schema + data written by the FastAPI backend.
      await db.pool.query(baseline);
      await db.pool.query(`INSERT INTO technicians (username, name, password_hash) VALUES ('ti', 'TI', '$argon2id$legacy')`);
      await db.pool.query(
        `INSERT INTO tickets (id, access_hash, name, department, category, title, description, status, priority, technician_id, created_at, location, affected_system, state)
         VALUES (41, repeat('a', 64), 'Ana', 'Financeiro', 'Internet', 'Sem rede', '', 'RESOLVIDO', 'ALTA', 1, '2026-09-01T12:00:00Z', 'Sala 1', '', 'PR')`,
      );
      await db.pool.query(`SELECT setval('tickets_id_seq', 41)`);
      await db.pool.query(`INSERT INTO ticket_history (ticket_id, message, created_at) VALUES (41, 'Chamado criado — aguardando TI', '2026-09-01T12:00:00Z')`);
      await db.pool.query(`INSERT INTO attachments (ticket_id, mime, data) VALUES (41, 'image/webp', '\\x52494646')`);
      await db.pool.query(`INSERT INTO sessions (token_hash, technician_id, expires_at) VALUES (repeat('b', 64), 1, now() + interval '1 hour')`);

      const result = await migrate(db.pool, { dryRun: true });
      assert.equal(result.skippedBaseline, true);
      const applied = await migrate(db.pool);
      assert.deepEqual(applied.applied, ['0006_history_kind_and_indexes']);

      const ticket = (await db.pool.query('SELECT * FROM tickets WHERE id = 41')).rows[0];
      assert.equal(ticket.title, 'Sem rede');
      assert.equal(ticket.priority, 'ALTA');
      const history = (await db.pool.query('SELECT message, kind, author_name FROM ticket_history')).rows;
      assert.deepEqual(history, [{ message: 'Chamado criado — aguardando TI', kind: 'event', author_name: null }]);
      assert.equal((await db.pool.query('SELECT COUNT(*)::int AS n FROM attachments')).rows[0].n, 1);
      assert.equal((await db.pool.query('SELECT COUNT(*)::int AS n FROM sessions')).rows[0].n, 1, 'sessions survive');
      // Legacy-style INSERT (without the new columns) still works after the migration (rollback safety).
      await db.pool.query(`INSERT INTO ticket_history (ticket_id, message, created_at) VALUES (41, 'escrito pelo legado', now())`);
      // New tickets continue the existing id sequence (protocols never collide).
      const next = await db.pool.query(
        `INSERT INTO tickets (access_hash, name, department, category, title, description, status, priority, created_at) VALUES (repeat('c', 64), 'B', 'Financeiro', 'Outro', 'Novo', '', 'NOVO', 'NORMAL', now()) RETURNING id`,
      );
      assert.equal(next.rows[0].id, 42);
    } finally {
      await db.drop();
    }
  });

  test('refuses databases on an older legacy revision', async () => {
    const db = await createSchema();
    try {
      await db.pool.query(baseline);
      await db.pool.query(`UPDATE alembic_version SET version_num = '0004'`);
      await assert.rejects(migrate(db.pool), MigrationError);
    } finally {
      await db.drop();
    }
  });

  test('the API runs on a legacy schema before 0006 is applied (features degrade gracefully)', async () => {
    const t = await startApp({ migrateTo: 'baseline' });
    try {
      await t.createTechnician('ana', 'Ana TI');
      const ana = await t.login('ana');
      const catalog = (await t.client().get('/catalog')).body;
      assert.equal(catalog.features.includes('notes'), false);
      const created = await createTicket(t.client());
      assert.equal((await ana.post(`/tickets/${created.id}/assign`)).status, 200);
      const note = await ana.post(`/tickets/${created.id}/notes`, { message: 'Estou a caminho' });
      assert.equal(note.status, 201);
      assert.equal(note.body.history.at(-1).message, 'Mensagem de Ana TI: Estou a caminho');
      assert.equal(note.body.history.at(-1).kind, 'event');
      assert.equal((await ana.get('/dashboard')).status, 200);
    } finally {
      await t.close();
    }
  });
});
