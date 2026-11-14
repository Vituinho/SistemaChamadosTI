import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';

/**
 * Forward-only, non-destructive SQL migrations.
 *
 * - Never runs automatically at startup: operators run `npm run migrate`.
 * - Existing production databases (created by the legacy Alembic migrations)
 *   must be at Alembic revision 0005; the baseline is then skipped.
 * - An empty database receives the baseline (identical to Alembic 0001..0005).
 * - Each migration runs in its own transaction under an advisory lock.
 */
export const MIGRATIONS_DIR = resolve(__dirname, '../../../migrations');
const BASELINE = '0000_baseline';
const LOCK_ID = 470_812_006;
const LEGACY_HEAD = '0005';

export class MigrationError extends Error {}

export interface Migration {
  version: string;
  sql: string;
}

export function loadMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter(file => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .sort()
    .map(file => ({ version: file.replace(/\.sql$/, ''), sql: readFileSync(join(dir, file), 'utf8') }));
}

/** Guard used by tests: migrations must never contain destructive statements. */
export function destructiveStatements(sql: string): string[] {
  const code = sql.replace(/--.*$/gm, '');
  return [...code.matchAll(/\b(DROP\s+(TABLE|COLUMN|SCHEMA|INDEX|CONSTRAINT)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\s+\w+\s+TYPE)\b/gi)].map(m => m[0]);
}

export interface SchemaState {
  hasTables: boolean;
  legacyVersion: string | null;
  applied: string[];
  pending: string[];
  historyKind: boolean;
}

async function exists(client: Pick<PoolClient, 'query'>, relation: string): Promise<boolean> {
  const { rows } = await client.query<{ found: string | null }>('SELECT to_regclass($1)::text AS found', [relation]);
  return rows[0].found !== null;
}

export async function inspectSchema(client: Pick<PoolClient, 'query'>, migrations = loadMigrations()): Promise<SchemaState> {
  const hasTables = await exists(client, 'tickets');
  const legacyVersion = (await exists(client, 'alembic_version'))
    ? ((await client.query<{ version_num: string }>('SELECT version_num FROM alembic_version LIMIT 1')).rows[0]?.version_num ?? null)
    : null;
  const applied = (await exists(client, 'schema_migrations'))
    ? (await client.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r => r.version)
    : [];
  const pending = migrations
    .map(m => m.version)
    .filter(version => !applied.includes(version) && !(version === BASELINE && hasTables));
  const { rows } = await client.query<{ found: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'ticket_history' AND column_name = 'kind'
     ) AS found`,
  );
  return { hasTables, legacyVersion, applied, pending, historyKind: rows[0].found };
}

export interface MigrateResult {
  applied: string[];
  skippedBaseline: boolean;
}

export async function migrate(
  pool: Pool,
  options: { dryRun?: boolean; log?: (message: string) => void } = {},
): Promise<MigrateResult> {
  const log = options.log ?? (() => undefined);
  const migrations = loadMigrations();
  for (const migration of migrations) {
    const found = destructiveStatements(migration.sql);
    if (found.length) throw new MigrationError(`Migration ${migration.version} contém comandos destrutivos: ${found.join(', ')}`);
  }
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    const state = await inspectSchema(client, migrations);
    if (state.hasTables && state.legacyVersion !== LEGACY_HEAD) {
      throw new MigrationError(
        `Banco existente com Alembic na versão ${state.legacyVersion ?? 'desconhecida'}. ` +
          `Atualize-o até ${LEGACY_HEAD} com o backend legado antes de usar estas migrations.`,
      );
    }
    if (options.dryRun) {
      log(state.pending.length ? `Pendentes: ${state.pending.join(', ')}` : 'Nenhuma migration pendente.');
      return { applied: [], skippedBaseline: state.hasTables };
    }
    const applied: string[] = [];
    for (const migration of migrations.filter(m => state.pending.includes(m.version))) {
      await client.query('BEGIN');
      try {
        await client.query(
          'CREATE TABLE IF NOT EXISTS schema_migrations (version character varying(64) PRIMARY KEY, applied_at timestamp with time zone DEFAULT now() NOT NULL)',
        );
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration.version]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new MigrationError(`Falha na migration ${migration.version}: ${(error as Error).message}`);
      }
      applied.push(migration.version);
      log(`Aplicada: ${migration.version}`);
    }
    if (!applied.length) log('Nenhuma migration pendente.');
    return { applied, skippedBaseline: state.hasTables };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
