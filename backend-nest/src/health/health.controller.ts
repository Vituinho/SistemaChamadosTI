import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/http/api-error';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  /** Readiness: the API and PostgreSQL are reachable (used by Render health checks). */
  @Get()
  async ready() {
    try {
      await this.db.query('SELECT 1');
    } catch {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'Banco de dados indisponível');
    }
    return { status: 'ok', system: 'Givova TI' };
  }

  /** Liveness: the process is running (does not touch the database). */
  @Get('live')
  live() {
    return { status: 'ok' };
  }
}
