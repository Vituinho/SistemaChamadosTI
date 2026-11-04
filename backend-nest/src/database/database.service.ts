import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

export type Queryable = Pick<PoolClient, 'query'>;

export function createPool(config: Pick<AppConfig, 'databaseUrl' | 'databaseSsl' | 'databasePoolMax'>): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 30_000,
    application_name: 'givova-ti-api',
    ...(config.databaseSsl ? { ssl: { rejectUnauthorized: true } } : {}),
  });
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = createPool(config);
    // An idle client error must never crash the process; the pool replaces the client.
    this.pool.on('error', error => this.logger.warn({ msg: 'Idle PostgreSQL client error', error: error.message }));
  }

  query<T extends QueryResultRow = QueryResultRow>(sql: string, params: readonly unknown[] = []) {
    return this.pool.query<T>(sql, params as unknown[]);
  }

  /** Runs `work` inside BEGIN/COMMIT; any thrown error rolls back. */
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
