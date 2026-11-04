import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { ApiError } from '../common/http/api-error';
import { digest, isTokenShaped, randomToken } from '../common/crypto';
import { DatabaseService } from '../database/database.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { hashPassword, verifyPassword } from './passwords';

export interface Technician {
  id: number;
  name: string;
}

export const SESSION_COOKIE = 'givova_session';
const UNAUTHENTICATED = 'Faça login para acessar a área da TI.';

@Injectable()
export class AuthService {
  private readonly limiter: LoginRateLimiter;
  /** Verifying against a dummy hash keeps response time similar for unknown users. */
  private readonly dummyHash = hashPassword('timing-equalisation-only');

  constructor(
    private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.limiter = new LoginRateLimiter(config.loginMaxAttempts, config.loginMaxAttemptsPerIp, config.loginWindowMs);
  }

  get sessionMaxAgeMs() {
    return this.config.sessionHours * 3_600_000;
  }

  async login(username: string, password: string, ip: string, previousToken?: unknown) {
    if (!this.limiter.tryConsume(ip, username)) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'Muitas tentativas. Aguarde cinco minutos.');
    }
    const { rows } = await this.db.query<{ id: number; name: string; password_hash: string }>(
      'SELECT id, name, password_hash FROM technicians WHERE username = $1',
      [username],
    );
    const user = rows[0];
    const valid = await verifyPassword(user?.password_hash ?? (await this.dummyHash), password);
    if (!user || !valid) throw new ApiError(HttpStatus.UNAUTHORIZED, 'Usuário ou senha inválidos');
    this.limiter.reset(ip, username);

    const token = randomToken();
    await this.db.transaction(async client => {
      if (isTokenShaped(previousToken)) {
        await client.query('DELETE FROM sessions WHERE token_hash = $1', [digest(previousToken)]);
      }
      await client.query('DELETE FROM sessions WHERE expires_at < now()');
      await client.query(
        "INSERT INTO sessions (token_hash, technician_id, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))",
        [digest(token), user.id, this.config.sessionHours],
      );
    });
    return { technician: { id: user.id, name: user.name } satisfies Technician, token };
  }

  /** Server-side validation on every request: revoked or expired sessions are refused. */
  async authenticate(token: unknown): Promise<Technician> {
    if (!isTokenShaped(token)) throw new ApiError(HttpStatus.UNAUTHORIZED, UNAUTHENTICATED);
    const { rows } = await this.db.query<Technician>(
      `SELECT t.id, t.name FROM sessions s JOIN technicians t ON t.id = s.technician_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [digest(token)],
    );
    if (!rows[0]) throw new ApiError(HttpStatus.UNAUTHORIZED, UNAUTHENTICATED);
    return rows[0];
  }

  async isSessionActive(tokenHash: string): Promise<boolean> {
    const { rowCount } = await this.db.query('SELECT 1 FROM sessions WHERE token_hash = $1 AND expires_at > now()', [tokenHash]);
    return Boolean(rowCount);
  }

  async logout(token: unknown) {
    if (isTokenShaped(token)) await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)]);
  }
}
