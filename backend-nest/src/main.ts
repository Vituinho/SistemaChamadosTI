import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './module';
import { envList } from './shared';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '6mb' }));
  app.use(urlencoded({ extended: false, limit: '6mb' }));
  app.use(cookieParser());
  const origins = envList('ALLOWED_ORIGINS', ['http://localhost:3000']);
  app.enableCors({ origin: origins, credentials: true, methods: ['GET', 'POST', 'PATCH'], allowedHeaders: ['Content-Type', 'X-Ticket-Key'] });
  app.use((req: Request, res: Response, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) &&
        (fetchSite === 'cross-site' || (origin && !origins.includes(origin)))) {
      res.status(403).json({ detail: 'Origem não permitida' });
      return;
    }
    next();
  });
  app.useGlobalFilters({
    catch(exception: unknown, host: import('@nestjs/common').ArgumentsHost) {
      const res = host.switchToHttp().getResponse<Response>();
      const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      const body = exception instanceof HttpException ? exception.getResponse() : null;
      const detail = typeof body === 'string' ? body
        : body && typeof body === 'object' && 'message' in body
          ? Array.isArray(body.message) ? 'Confira os campos e seus limites.' : String(body.message)
          : status === 413 ? 'A requisição excede 6 MB.' : 'Erro interno. Tente novamente.';
      if (status >= 500) console.error('API error:', exception);
      res.status(status).json({ detail });
    },
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 8000), '0.0.0.0');
}
void bootstrap().catch(err => { console.error(err); process.exitCode = 1; });
