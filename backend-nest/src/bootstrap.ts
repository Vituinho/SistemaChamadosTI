import 'reflect-metadata';
import { ConsoleLogger, type INestApplication, type LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule, type AppModuleOptions } from './app.module';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { bodyParserErrors, contentTypeGuard, originCheck, requestLogger } from './common/http/middleware';
import { createValidationPipe } from './common/http/validation';

export function createLogger(format: 'json' | 'pretty', silent = false): LoggerService {
  return new ConsoleLogger('GivovaTI', {
    json: format === 'json',
    colors: format === 'pretty',
    logLevels: silent ? ['error'] : ['log', 'warn', 'error'],
  });
}

/** Builds the fully configured HTTP application (shared by main.ts and the integration tests). */
export async function createApp(options: AppModuleOptions & { logger?: LoggerService }): Promise<INestApplication> {
  const { config } = options;
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(options), {
    bodyParser: false,
    logger: options.logger ?? createLogger(config.logFormat),
  });
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(requestLogger());
  app.use(
    helmet({
      // JSON API: deny framing and every resource type; attachments add their own sandbox CSP.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: config.cookieSecure ? { maxAge: 31_536_000, includeSubDomains: false } : false,
    }),
  );
  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.enableCors({
    origin: config.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'X-Ticket-Key'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
  app.use(originCheck(config.allowedOrigins));
  app.use(contentTypeGuard());
  app.use(json({ limit: '64kb', strict: true }));
  app.use(bodyParserErrors());
  app.use(cookieParser());
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
