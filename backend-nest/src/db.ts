import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class Database implements OnModuleDestroy {
  readonly pool: Pool;
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      ...(process.env.DATABASE_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
    });
  }
  query<T extends import('pg').QueryResultRow = import('pg').QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.pool.query<T>(sql, params);
  }
  async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  }
  onModuleDestroy() { return this.pool.end(); }
}
