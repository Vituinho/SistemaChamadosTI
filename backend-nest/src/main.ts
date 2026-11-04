import type { INestApplication, LoggerService } from '@nestjs/common';
import type { Server } from 'node:http';
import { createApp, createLogger } from './bootstrap';
import { lifecycle } from './common/lifecycle';
import { ConfigError, loadConfig, type AppConfig } from './config/app-config';
import { EventsService } from './tickets/events.service';

/**
 * Listens on "::" (dual-stack: IPv6 and IPv4). Railway's private network may be
 * IPv6-only in older environments; hosts without IPv6 fall back to 0.0.0.0.
 */
async function listen(app: INestApplication, config: AppConfig, logger: LoggerService) {
  if (config.host !== '::') return app.listen(config.port, config.host);
  try {
    return await app.listen(config.port, '::');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EAFNOSUPPORT' && code !== 'EADDRNOTAVAIL') throw error;
    logger.warn({ msg: 'IPv6 indisponível; escutando apenas em IPv4', code });
    return app.listen(config.port, '0.0.0.0');
  }
}

/**
 * Graceful shutdown (Railway sends SIGTERM, then SIGKILL after the configured
 * draining time): stop accepting connections, end live event streams, let
 * in-flight requests finish (up to SHUTDOWN_GRACE_SECONDS), then close the
 * database pool and exit.
 */
function handleShutdown(app: INestApplication, config: AppConfig, logger: LoggerService) {
  let started = false;
  const shutdown = async (signal: string) => {
    if (started) return;
    started = true;
    lifecycle.draining = true;
    logger.log({ msg: 'Encerrando a API', signal, graceMs: config.shutdownGraceMs });
    const server = app.getHttpServer() as Server;
    const closed = new Promise<void>(resolve => server.close(() => resolve()));
    app.get(EventsService, { strict: false }).closeAll();
    server.closeIdleConnections();
    const timer = setTimeout(() => {
      logger.warn({ msg: 'Tempo de encerramento esgotado; fechando conexões restantes' });
      server.closeAllConnections();
    }, config.shutdownGraceMs);
    await closed;
    clearTimeout(timer);
    await app.close();
    logger.log({ msg: 'API encerrada' });
    process.exit(0);
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      shutdown(signal).catch(error => {
        logger.error({ msg: 'Falha no encerramento', error: (error as Error).message });
        process.exit(1);
      });
    });
  }
}

async function main() {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`Configuração inválida: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
  const logger = createLogger(config.logFormat);
  for (const warning of config.warnings) logger.warn({ msg: warning });
  const app = await createApp({ config, logger });
  await listen(app, config, logger);
  handleShutdown(app, config, logger);
  logger.log({ msg: 'API iniciada', port: config.port, env: config.env, origins: config.allowedOrigins, trustProxy: config.trustProxy, push: Boolean(config.vapid) });
}

main().catch(error => {
  console.error('Falha ao iniciar a API', error);
  process.exit(1);
});
