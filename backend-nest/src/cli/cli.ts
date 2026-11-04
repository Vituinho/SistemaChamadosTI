/**
 * Operations CLI (run with `npm run cli -- <command>` after `npm run build`).
 *
 *   migrate [--dry-run]       apply pending non-destructive migrations
 *   create-user               create a technician (prompts; password hidden)
 *   reset-password <usuario>  set a new password and revoke the user's sessions
 *   revoke-sessions <usuario> sign the user out of every device
 *   list-users                list technicians (no hashes)
 *   db-report [--json]        READ-ONLY summary + content fingerprints of the database
 *                             (run on the source and on the restored copy and compare)
 *   generate-vapid            print a new Web Push key pair (only for first setup)
 *
 * Passwords can also be provided via GIVOVA_PASSWORD for non-interactive use.
 * They are never accepted as command-line arguments (shell history).
 */
import { createInterface } from 'node:readline';
import webpush from 'web-push';
import { createPool } from '../database/database.service';
import { migrate } from '../database/migrator';
import { MIN_PASSWORD_LENGTH } from '../auth/password-policy';

/** argon2 is a native module: load it only for commands that hash passwords. */
async function hashPassword(password: string) {
  return (await import('../auth/passwords')).hashPassword(password);
}

/**
 * Read-only database summary used to prove a migration preserved the data:
 * row counts, id ranges, sequences and md5 fingerprints of the content
 * (no secrets or personal data are printed — only counts and hashes).
 */
async function databaseReport(pool: ReturnType<typeof createPool>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const one = async (sql: string) => (await client.query(sql)).rows[0] ?? {};
    const exists = async (name: string) => (await one(`SELECT to_regclass('${name}')::text AS t`)).t !== null;
    if (!(await exists('tickets'))) return { error: 'Tabela tickets inexistente: banco vazio ou schema errado.' };
    const report: Record<string, unknown> = {
      database: (await one('SELECT current_database() AS d, version() AS v')).d,
      server_version: (await one('SHOW server_version')).server_version,
      alembic_version: (await exists('alembic_version')) ? (await one('SELECT version_num FROM alembic_version')).version_num ?? null : null,
      schema_migrations: (await exists('schema_migrations'))
        ? (await client.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r => r.version)
        : [],
    };
    for (const table of ['technicians', 'sessions', 'tickets', 'ticket_history', 'attachments', 'push_subscriptions']) {
      report[`count_${table}`] = Number((await one(`SELECT COUNT(*) AS n FROM ${table}`)).n);
    }
    Object.assign(report, {
      tickets_id_range: await one('SELECT MIN(id) AS min, MAX(id) AS max FROM tickets'),
      tickets_created_range: await one('SELECT MIN(created_at) AS first, MAX(created_at) AS last FROM tickets'),
      tickets_by_status: Object.fromEntries((await client.query('SELECT status, COUNT(*)::int AS n FROM tickets GROUP BY status ORDER BY status')).rows.map(r => [r.status, r.n])),
      sequence_tickets: Number((await one('SELECT last_value FROM tickets_id_seq')).last_value),
      sequence_ticket_history: Number((await one('SELECT last_value FROM ticket_history_id_seq')).last_value),
      attachments_bytes: Number((await one('SELECT COALESCE(SUM(octet_length(data)), 0) AS b FROM attachments')).b),
      fingerprint_tickets: (await one(`SELECT md5(COALESCE(string_agg(concat_ws('|', id, access_hash, name, department, state, location, category, affected_system, md5(title), md5(description), status, priority, technician_id, created_at, assigned_at, resolved_at, md5(COALESCE(solution, ''))), ',' ORDER BY id), '')) AS f FROM tickets`)).f,
      fingerprint_history: (await one(`SELECT md5(COALESCE(string_agg(concat_ws('|', id, ticket_id, md5(message), created_at), ',' ORDER BY id), '')) AS f FROM ticket_history`)).f,
      fingerprint_attachments: (await one(`SELECT md5(COALESCE(string_agg(concat_ws('|', ticket_id, mime, md5(data)), ',' ORDER BY ticket_id), '')) AS f FROM attachments`)).f,
      fingerprint_technicians: (await one(`SELECT md5(COALESCE(string_agg(concat_ws('|', id, username, name, password_hash), ',' ORDER BY id), '')) AS f FROM technicians`)).f,
    });
    return report;
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

function databaseConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL é obrigatório.');
  return { databaseUrl, databaseSsl: process.env.DATABASE_SSL === 'true', databasePoolMax: 2 };
}

/**
 * One readline for the whole session. Lines are consumed through the async
 * iterator, which buffers them, so piped input (scripts) is never lost.
 */
let prompt: { rl: ReturnType<typeof createInterface>; lines: AsyncIterator<string>; muted: boolean } | null = null;

async function ask(question: string, hidden = false): Promise<string> {
  if (!prompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    const state = { rl, lines: rl[Symbol.asyncIterator](), muted: false };
    const internal = rl as unknown as { _writeToOutput: (text: string) => void };
    const original = internal._writeToOutput.bind(rl);
    // Hide typed characters of passwords on interactive terminals.
    internal._writeToOutput = (text: string) => (state.muted ? undefined : original(text));
    prompt = state;
  }
  process.stdout.write(question);
  prompt.muted = hidden && Boolean(process.stdin.isTTY);
  const { value, done } = await prompt.lines.next();
  if (prompt.muted || !process.stdin.isTTY) process.stdout.write('\n');
  prompt.muted = false;
  if (done) throw new Error('Entrada encerrada antes de concluir. Nada foi gravado.');
  return value;
}

function closePrompt() {
  prompt?.rl.close();
  prompt = null;
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.GIVOVA_PASSWORD;
  if (fromEnv) return fromEnv;
  const password = await ask(`Senha (mínimo ${MIN_PASSWORD_LENGTH} caracteres): `, true);
  const confirm = await ask('Repita a senha: ', true);
  if (password !== confirm) throw new Error('As senhas não conferem. Nada foi gravado.');
  return password;
}

function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 256) {
    throw new Error(`A senha deve ter entre ${MIN_PASSWORD_LENGTH} e 256 caracteres.`);
  }
}

async function main() {
  const [command, arg, flag] = process.argv.slice(2);
  if (command === 'generate-vapid') {
    const keys = webpush.generateVAPIDKeys();
    console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}`);
    console.log('Guarde a chave privada apenas no provedor da API. Não gere outro par se já houver computadores cadastrados.');
    return;
  }
  const pool = createPool(databaseConfig());
  try {
    switch (command) {
      case 'migrate': {
        const dryRun = arg === '--dry-run' || flag === '--dry-run';
        await migrate(pool, { dryRun, log: message => console.log(message) });
        break;
      }
      case 'create-user': {
        const username = (await ask('Usuário: ')).trim().toLowerCase();
        const name = (await ask('Nome: ')).trim();
        if (!/^[a-z0-9._-]{1,80}$/.test(username) || name.length < 2 || name.length > 120) {
          throw new Error('Usuário (letras minúsculas, números, . _ -) ou nome inválido. Nada foi gravado.');
        }
        const password = await readPassword();
        validatePassword(password);
        const { rowCount } = await pool.query(
          'INSERT INTO technicians (username, name, password_hash) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING',
          [username, name, await hashPassword(password)],
        );
        console.log(rowCount ? 'Técnico criado. Faça login em /ti.' : 'Usuário já existe. Nada foi alterado.');
        break;
      }
      case 'reset-password': {
        const username = (arg ?? '').trim().toLowerCase();
        if (!username) throw new Error('Informe o usuário: reset-password <usuario>');
        const password = await readPassword();
        validatePassword(password);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows } = await client.query<{ id: number }>(
            'UPDATE technicians SET password_hash = $1 WHERE username = $2 RETURNING id',
            [await hashPassword(password), username],
          );
          if (!rows[0]) throw new Error('Usuário não encontrado. Nada foi alterado.');
          await client.query('DELETE FROM sessions WHERE technician_id = $1', [rows[0].id]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
        console.log('Senha alterada e sessões encerradas.');
        break;
      }
      case 'revoke-sessions': {
        const username = (arg ?? '').trim().toLowerCase();
        const { rowCount } = await pool.query(
          'DELETE FROM sessions WHERE technician_id = (SELECT id FROM technicians WHERE username = $1)',
          [username],
        );
        console.log(`${rowCount ?? 0} sessão(ões) encerrada(s).`);
        break;
      }
      case 'list-users': {
        const { rows } = await pool.query<{ id: number; username: string; name: string; sessions: number }>(
          `SELECT u.id, u.username, u.name, COUNT(s.token_hash) FILTER (WHERE s.expires_at > now())::int AS sessions
           FROM technicians u LEFT JOIN sessions s ON s.technician_id = u.id GROUP BY u.id ORDER BY u.username`,
        );
        console.table(rows);
        break;
      }
      case 'db-report': {
        const report = await databaseReport(pool);
        if (arg === '--json') console.log(JSON.stringify(report, null, 2));
        else {
          for (const [key, value] of Object.entries(report)) console.log(`${key.padEnd(24)} ${typeof value === 'object' ? JSON.stringify(value) : value}`);
        }
        break;
      }
      default:
        console.log('Comandos: migrate [--dry-run] | create-user | reset-password <usuario> | revoke-sessions <usuario> | list-users | db-report [--json] | generate-vapid');
        process.exitCode = command ? 1 : 0;
    }
  } finally {
    closePrompt();
    await pool.end();
  }
}

main().catch(error => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
