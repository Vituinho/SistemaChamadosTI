import { Controller, Get, Header, Inject } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { BRAZILIAN_STATES, CATEGORIES, DEPARTMENTS, PRIORITIES, STATUSES, SYSTEMS } from '../common/catalog';
import { SchemaService } from '../database/schema.service';

/**
 * Capabilities advertised to the frontend. The UI enables v2 features only when
 * they are listed, so the same static build works with the legacy FastAPI API.
 */
export const API_VERSION = 2;

@Controller()
export class CatalogController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly schema: SchemaService,
  ) {}

  @Get('catalog')
  @Header('Cache-Control', 'no-cache')
  catalog() {
    const features = ['sort', 'scope', 'assigned', 'metrics', 'revision', 'tracking_link', 'notes'];
    return {
      departments: DEPARTMENTS,
      states: BRAZILIAN_STATES,
      categories: CATEGORIES,
      systems: SYSTEMS,
      statuses: STATUSES,
      priorities: PRIORITIES,
      api_version: API_VERSION,
      features: this.schema.historyKind ? features : features.filter(f => f !== 'notes'),
      sla_first_response_minutes: this.config.slaFirstResponseMinutes,
    };
  }

  @Get('departments')
  departments() {
    return DEPARTMENTS;
  }
}
