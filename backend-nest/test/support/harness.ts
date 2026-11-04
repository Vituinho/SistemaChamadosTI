import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import webpush from 'web-push';
import { createApp, createLogger } from '../../src/bootstrap';
import { loadConfig } from '../../src/config/app-config';
import { migrate } from '../../src/database/migrator';
import { hashPassword } from '../../src/auth/passwords';

/** Argon2id hash produced by the legacy Python backend (pwdlib) for "legacy-password-for-tests". */
export const LEGACY_PWDLIB_HASH = '$argon2id$v=19$m=65536,t=3,p=4$1f5Ezxc6KDw42G5t6oGjPg$ckdV8OiiilOizY4NdNa/5OFYg1fsDFmTPZhjfwDRCrg';
export const LEGACY_PASSWORD = 'legacy-password-for-tests';
export const ORIGIN = 'http://localhost:3000';

export const databaseUrl = process.env.TEST_DATABASE_URL;
/** Integration suites are skipped (and reported as such) without a disposable database. */
export const skipReason = databaseUrl ? false : 'TEST_DATABASE_URL não configurada (PostgreSQL descartável)';

export function withSearchPath(url: string, schema: string) {
  return `${url}${url.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
}

/** Creates an isolated schema in the disposable database. Never use a production URL. */
export async function createSchema(): Promise<{ schema: string; url: string; pool: Pool; drop: () => Promise<void> }> {
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL ausente');
  const schema = `test_${randomBytes(6).toString('hex')}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = withSearchPath(databaseUrl, schema);
  const pool = new Pool({ connectionString: url, max: 4 });
  return {
    schema,
    url,
    pool,
    drop: async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}

export interface Response<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

/** Minimal HTTP client with a cookie jar (one per simulated browser). */
export class Client {
  cookie = '';
  constructor(readonly base: string) {}

  async request<T = any>(
    method: string,
    path: string,
    options: { json?: unknown; form?: FormData; headers?: Record<string, string>; origin?: string | null } = {},
  ): Promise<Response<T>> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (this.cookie) headers.Cookie = this.cookie;
    if (method !== 'GET' && options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
    let body: string | FormData | undefined;
    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.form) {
      body = options.form;
    }
    const res = await fetch(this.base + path, { method, headers, body, redirect: 'manual' });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie?.startsWith('givova_session=')) {
      const value = setCookie.split(';')[0];
      this.cookie = /givova_session=;/.test(setCookie + ';') || /Expires=Thu, 01 Jan 1970/i.test(setCookie) ? '' : value;
    }
    const type = res.headers.get('content-type') ?? '';
    const parsed = type.includes('application/json') ? await res.json() : type.startsWith('image/') ? Buffer.from(await res.arrayBuffer()) : await res.text();
    return { status: res.status, body: parsed as T, headers: res.headers };
  }

  get<T = any>(path: string, headers?: Record<string, string>) {
    return this.request<T>('GET', path, { headers });
  }
  post<T = any>(path: string, json?: unknown) {
    return this.request<T>('POST', path, json === undefined ? {} : { json });
  }
  patch<T = any>(path: string, json: unknown) {
    return this.request<T>('PATCH', path, { json });
  }
}

export interface PushCall {
  endpoint: string;
  payload: Record<string, string>;
}

export interface TestApp {
  app: INestApplication;
  base: string;
  pool: Pool;
  pushes: PushCall[];
  client: () => Client;
  createTechnician: (username: string, name: string, password?: string) => Promise<number>;
  login: (username: string, password?: string) => Promise<Client>;
  close: () => Promise<void>;
}

export const DEFAULT_PASSWORD = 'senha-de-teste-segura-123';

export async function startApp(options: { env?: Record<string, string>; migrateTo?: 'all' | 'baseline' } = {}): Promise<TestApp> {
  const db = await createSchema();
  if (options.migrateTo === 'baseline') {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { MIGRATIONS_DIR } = await import('../../src/database/migrator');
    await db.pool.query(readFileSync(join(MIGRATIONS_DIR, '0000_baseline.sql'), 'utf8'));
  } else {
    await migrate(db.pool);
  }
  const keys = webpush.generateVAPIDKeys();
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: db.url,
    DATABASE_POOL_MAX: '5',
    COOKIE_SECURE: 'false',
    ALLOWED_ORIGINS: JSON.stringify([ORIGIN]),
    LOGIN_MAX_ATTEMPTS: '5',
    LOGIN_MAX_ATTEMPTS_PER_IP: '1000',
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: 'mailto:ti@example.com',
    LOG_FORMAT: 'json',
    ...options.env,
  });
  const pushes: PushCall[] = [];
  const app = await createApp({
    config,
    logger: createLogger('json', true),
    pushSender: async (subscription, payload) => {
      pushes.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
      if (subscription.endpoint.includes('/gone/')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      return {};
    },
  });
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const createTechnician = async (username: string, name: string, password = DEFAULT_PASSWORD) => {
    const { rows } = await db.pool.query<{ id: number }>(
      'INSERT INTO technicians (username, name, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [username, name, password === LEGACY_PASSWORD ? LEGACY_PWDLIB_HASH : await hashPassword(password)],
    );
    return rows[0].id;
  };
  const login = async (username: string, password = DEFAULT_PASSWORD) => {
    const client = new Client(base);
    const res = await client.post('/auth/login', { username, password });
    if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
    return client;
  };
  return {
    app,
    base,
    pool: db.pool,
    pushes,
    client: () => new Client(base),
    createTechnician,
    login,
    close: async () => {
      await app.close();
      await db.drop();
    },
  };
}

export const VALID_TICKET = {
  name: 'Maria Colaboradora',
  department: 'Financeiro',
  state: 'PR',
  location: 'Sala 2',
  category: 'Sistema',
  affected_system: 'DBFrete',
  title: 'Não consigo abrir o DBFrete',
  description: 'Erro ao fazer login',
};

export async function createTicket(client: Client, overrides: Record<string, unknown> = {}) {
  const res = await client.post('/tickets', { ...VALID_TICKET, ...overrides });
  if (res.status !== 201) throw new Error(`create failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: number; protocol: string; access_key: string; [key: string]: any };
}
