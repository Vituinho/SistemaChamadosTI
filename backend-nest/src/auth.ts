import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { Database } from './db';
import { COOKIE, digest, validateLogin } from './shared';

export interface Technician { id: number; name: string }
export type AuthRequest = Request & { technician?: Technician; sessionToken?: string };
const attempts = new Map<string, number[]>();

@Injectable()
export class AuthService {
  private dummyHash: Promise<string>;
  constructor(private readonly db: Database) {
    this.dummyHash = argon2.hash('timing-only-dummy-password', { type: argon2.argon2id });
  }
  private rateLimit(key: string) {
    const now = Date.now();
    // Bound memory; aggregate by IP plus username (the PHP proxy shares an outbound IP).
    for (const [stored, values] of attempts) {
      const valid = values.filter(time => time > now - 300_000);
      if (valid.length) attempts.set(stored, valid); else attempts.delete(stored);
    }
    const values = attempts.get(key) ?? [];
    if (attempts.size > 10_000 || values.length >= 10) throw new HttpException('Muitas tentativas. Aguarde cinco minutos.', HttpStatus.TOO_MANY_REQUESTS);
    values.push(now);
    attempts.set(key, values);
  }
  private durationMs() {
    const hours = Number(process.env.SESSION_HOURS ?? 8);
    return (Number.isFinite(hours) && hours > 0 && hours <= 72 ? hours : 8) * 3_600_000;
  }
  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE, token, {
      httpOnly: true, secure: process.env.COOKIE_SECURE !== 'false',
      sameSite: 'strict', path: '/', maxAge: this.durationMs(),
    });
  }
  async login(body: unknown, req: Request, res: Response) {
    const { username, password } = validateLogin(body);
    this.rateLimit((req.ip || req.socket.remoteAddress || 'unknown') + ':' + username);
    const { rows } = await this.db.query<{ id: number; name: string; password_hash: string }>(
      'SELECT id, name, password_hash FROM technicians WHERE username = $1', [username]);
    const user = rows[0];
    let valid = false;
    try { valid = await argon2.verify(user?.password_hash || await this.dummyHash, password); } catch { valid = false; }
    if (!user || !valid) throw new UnauthorizedException('Usuário ou senha inválidos');
    const token = randomBytes(32).toString('base64url');
    await this.db.transaction(async client => {
      const old = req.cookies?.[COOKIE];
      if (typeof old === 'string') await client.query('DELETE FROM sessions WHERE token_hash = $1', [digest(old)]);
      await client.query('DELETE FROM sessions WHERE expires_at < now()');
      await client.query(
        'INSERT INTO sessions (token_hash, technician_id, expires_at) VALUES ($1, $2, $3)',
        [digest(token), user.id, new Date(Date.now() + this.durationMs())]);
    });
    this.setCookie(res, token);
    return { id: user.id, name: user.name };
  }
  async authenticate(req: AuthRequest): Promise<Technician> {
    const token = req.cookies?.[COOKIE];
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(token)) {
      throw new UnauthorizedException('Faça login para acessar a área da TI.');
    }
    const { rows } = await this.db.query<Technician>(
      'SELECT t.id, t.name FROM sessions s JOIN technicians t ON t.id = s.technician_id WHERE s.token_hash = $1 AND s.expires_at > now()',
      [digest(token)]);
    if (!rows[0]) throw new UnauthorizedException('Faça login para acessar a área da TI.');
    req.technician = rows[0];
    req.sessionToken = token;
    return rows[0];
  }
  async logout(req: Request, res: Response) {
    const token = req.cookies?.[COOKIE];
    if (typeof token === 'string') await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)]);
    res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE !== 'false' });
    return { ok: true };
  }
}

@Injectable()
export class TechnicianGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    await this.auth.authenticate(context.switchToHttp().getRequest<AuthRequest>());
    return true;
  }
}
