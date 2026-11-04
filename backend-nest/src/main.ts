import { createApp, createLogger } from './bootstrap';
import { ConfigError, loadConfig } from './config/app-config';

async function main() {
  let config;
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
  const app = await createApp({ config, logger });
  await app.listen(config.port, '0.0.0.0');
  logger.log({ msg: 'API iniciada', port: config.port, env: config.env, origins: config.allowedOrigins, push: Boolean(config.vapid) });
}

main().catch(error => {
  console.error('Falha ao iniciar a API', error);
  process.exit(1);
});
