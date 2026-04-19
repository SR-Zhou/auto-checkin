import { buildConfig } from './config.js';
import { createLogger } from './logger.js';
import { startService } from './service.js';
import { loadDotEnv } from './utils/load-dotenv.js';

async function main() {
  await loadDotEnv('.env');

  const config = await buildConfig();
  process.env.TZ = config.timezone;

  const logger = createLogger({ logPath: config.logPath });
  await startService({ config, logger });
}

main().catch((error) => {
  console.error('[fatal] service boot failed', error);
  process.exit(1);
});
