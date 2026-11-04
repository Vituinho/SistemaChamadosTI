/**
 * Operations CLI (run with `npm run cli -- <command>` after `npm run build`).
 *
 *   migrate [--dry-run]       apply pending non-destructive migrations
 *   create-user               create a technician (prompts; password hidden)
 *   reset-password <usuario>  set a new password and revoke the user's sessions
 *   revoke-sessions <usuario> sign the user out of every device
 *   list-users                list technicians (no hashes)
 *   generate-vapid            print a new Web Push key pair (only for first setup)
 *
 * Passwords can also be provided via GIVOVA_PASSWORD for non-interactive use.
 * They are never accepted as command-line arguments (shell history).
 */
import { createInterface } from 'node:readline';
import webpush from 'web-push';
import { createPool } from '../database/database.service';
import { migrate } from '../database/migrator';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth/passwords';

function databaseConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL é obrigatório.');
  return { databaseUrl, databaseSsl: process.env.DATABASE_SSL === 'true', databasePoolMax: 2 };
}

function ask(question: string, hidden = false): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const output = rl as unknown as { _writeToOutput: (text: string) => void };
      output._writeToOutput = (text: string) => {
        if (text.includes(question)) process.stdout.write(text);
      };
    }
    rl.question(question, answer => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
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
      default:
        console.log('Comandos: migrate [--dry-run] | create-user | reset-password <usuario> | revoke-sessions <usuario> | list-users | generate-vapid');
        process.exitCode = command ? 1 : 0;
    }
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
