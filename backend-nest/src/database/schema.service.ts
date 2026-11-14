import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { inspectSchema } from './migrator';

/**
 * Detects optional schema features at startup so the API keeps working
 * (with reduced features) if `npm run migrate` has not been executed yet.
 */
@Injectable()
export class SchemaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaService.name);
  historyKind = false;
  pending: string[] = [];

  constructor(private readonly db: DatabaseService) {}

  async onApplicationBootstrap() {
    await this.refresh();
  }

  async refresh() {
    try {
      const state = await inspectSchema(this.db.pool);
      if (!state.hasTables) {
        this.logger.error({ msg: 'Banco sem as tabelas do sistema. Execute npm run migrate.' });
      }
      this.historyKind = state.historyKind;
      this.pending = state.pending;
      if (state.pending.length) {
        this.logger.warn({ msg: 'Migrations pendentes; recursos novos ficam desativados até npm run migrate.', pending: state.pending });
      }
    } catch (error) {
      // Database may be temporarily unavailable at boot; /health reports it.
      this.logger.warn({ msg: 'Não foi possível inspecionar o schema na inicialização', error: (error as Error).message });
    }
  }
}
