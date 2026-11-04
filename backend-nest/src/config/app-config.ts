import { PRIORITIES, type Priority } from '../common/catalog';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface AppConfig {
  env: 'production' | 'development' | 'test';
  port: number;
  databaseUrl: string;
  databaseSsl: boolean;
  databasePoolMax: number;
  allowedOrigins: string[];
  cookieSecure: boolean;
  sessionHours: number;
  timezone: string;
  /** Number of trusted reverse proxies (Render = 1). 0 disables X-Forwarded-For. */
  trustProxy: number;
  loginMaxAttempts: number;
  loginMaxAttemptsPerIp: number;
  loginWindowMs: number;
  /** Max ticket creations per client IP in ticketCreateWindowMs (public endpoint). */
  ticketCreateMaxPerIp: number;
  ticketCreateWindowMs: number;
  /**
   * Minutes until a NEW ticket without first response is flagged as overdue.
   * null = not configured: no overdue indicator is computed or shown. There is
   * deliberately no built-in default — the targets are a business decision.
   */
  slaFirstResponseMinutes: Record<Priority, number> | null;
  vapid: VapidConfig | null;
  logFormat: 'json' | 'pretty';
}

export class ConfigError extends Error {}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  }
  return value;
}

function bool(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new ConfigError(`${name} deve ser true ou false.`);
}

function origins(env: NodeJS.ProcessEnv): string[] {
  const raw = env.ALLOWED_ORIGINS;
  if (!raw) return ['http://localhost:3000'];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError('ALLOWED_ORIGINS deve ser uma lista JSON, por exemplo ["https://suporte.exemplo.com.br"].');
  }
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
    throw new ConfigError('ALLOWED_ORIGINS deve ser uma lista JSON de textos.');
  }
  return parsed.map(origin => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new ConfigError(`Origem inválida em ALLOWED_ORIGINS: ${origin}`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin.replace(/\/+$/, '')) {
      throw new ConfigError(`Use apenas esquema, host e porta em ALLOWED_ORIGINS: ${origin}`);
    }
    return url.origin;
  });
}

function sla(env: NodeJS.ProcessEnv): Record<Priority, number> | null {
  const raw = env.SLA_FIRST_RESPONSE_MINUTES?.trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError('SLA_FIRST_RESPONSE_MINUTES deve ser um objeto JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError('SLA_FIRST_RESPONSE_MINUTES deve ser um objeto JSON.');
  }
  const entries = Object.entries(parsed);
  const message = 'SLA_FIRST_RESPONSE_MINUTES deve definir BAIXA, NORMAL, ALTA e URGENTE, cada um com minutos entre 1 e 10080.';
  if (entries.length !== PRIORITIES.length) throw new ConfigError(message);
  const result = {} as Record<Priority, number>;
  for (const [key, value] of entries) {
    if (!(PRIORITIES as readonly string[]).includes(key) || !Number.isInteger(value) || (value as number) < 1 || (value as number) > 10_080) {
      throw new ConfigError(message);
    }
    result[key as Priority] = value as number;
  }
  return result;
}

function timezone(env: NodeJS.ProcessEnv): string {
  const value = env.TIMEZONE || 'America/Sao_Paulo';
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value });
  } catch {
    throw new ConfigError(`TIMEZONE inválido: ${value}`);
  }
  if (!/^[A-Za-z_]+(?:\/[A-Za-z_+-]+){0,2}$/.test(value)) throw new ConfigError(`TIMEZONE inválido: ${value}`);
  return value;
}

function vapid(env: NodeJS.ProcessEnv): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? '';
  const subject = env.VAPID_SUBJECT?.trim() ?? '';
  if (!publicKey && !privateKey) return null;
  if (!publicKey || !privateKey || !subject) {
    throw new ConfigError('Configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT juntos.');
  }
  if (!/^(mailto:|https:\/\/)/.test(subject)) throw new ConfigError('VAPID_SUBJECT deve começar com mailto: ou https://');
  return { publicKey, privateKey, subject };
}

/** Reads and validates environment variables once at startup (fail fast). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new ConfigError('DATABASE_URL é obrigatório.');
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) throw new ConfigError('DATABASE_URL deve começar com postgresql://');
  const cookieSecure = bool(env, 'COOKIE_SECURE', true);
  if (nodeEnv === 'production' && !cookieSecure) {
    throw new ConfigError('COOKIE_SECURE=false não é permitido em produção.');
  }
  const format = env.LOG_FORMAT ?? (nodeEnv === 'production' ? 'json' : 'pretty');
  if (format !== 'json' && format !== 'pretty') throw new ConfigError('LOG_FORMAT deve ser json ou pretty.');
  return {
    env: nodeEnv,
    port: integer(env, 'PORT', 8000, 1, 65_535),
    databaseUrl,
    databaseSsl: bool(env, 'DATABASE_SSL', false),
    databasePoolMax: integer(env, 'DATABASE_POOL_MAX', 10, 1, 50),
    allowedOrigins: origins(env),
    cookieSecure,
    sessionHours: integer(env, 'SESSION_HOURS', 8, 1, 72),
    timezone: timezone(env),
    trustProxy: integer(env, 'TRUST_PROXY', 0, 0, 5),
    loginMaxAttempts: integer(env, 'LOGIN_MAX_ATTEMPTS', 10, 3, 100),
    loginMaxAttemptsPerIp: integer(env, 'LOGIN_MAX_ATTEMPTS_PER_IP', 30, 5, 1000),
    loginWindowMs: 5 * 60_000,
    ticketCreateMaxPerIp: integer(env, 'TICKET_CREATE_MAX_PER_IP', 60, 5, 10_000),
    ticketCreateWindowMs: 10 * 60_000,
    slaFirstResponseMinutes: sla(env),
    vapid: vapid(env),
    logFormat: format,
  };
}
