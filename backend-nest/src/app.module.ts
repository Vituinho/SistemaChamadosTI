import { DynamicModule, Global, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CatalogController } from './catalog/catalog.controller';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { PushModule } from './push/push.module';
import { PUSH_SENDER, type PushSender } from './push/push.service';
import { TicketsModule } from './tickets/tickets.module';

export interface AppModuleOptions {
  config: AppConfig;
  /** Overrides the Web Push transport (tests). */
  pushSender?: PushSender;
}

@Global()
@Module({})
class CoreModule {
  static register(options: AppModuleOptions): DynamicModule {
    return {
      module: CoreModule,
      providers: [
        { provide: APP_CONFIG, useValue: Object.freeze({ ...options.config }) },
        { provide: PUSH_SENDER, useValue: options.pushSender ?? null },
      ],
      exports: [APP_CONFIG, PUSH_SENDER],
    };
  }
}

@Module({})
export class AppModule {
  static forRoot(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreModule.register(options), DatabaseModule, AuthModule, TicketsModule, DashboardModule, PushModule],
      controllers: [HealthController, CatalogController],
    };
  }
}
