import './bootstrap-env.js';
import 'express-async-errors';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';
import { startReminderWorker, stopReminderWorker } from './modules/notification/reminder-worker.js';

async function main() {
  const app = createApp();
  const server = app.listen(env.API_PORT, env.API_HOST, () => {
    logger.info({ port: env.API_PORT, host: env.API_HOST }, 'API listening');
    startReminderWorker();
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    stopReminderWorker();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
