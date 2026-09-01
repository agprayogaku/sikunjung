import { createApp } from './app';
import { env } from './config/env';
import { bootstrapSystem } from './bootstrap/seedData';
import { startDailyMaintenanceScheduler } from './bootstrap/dailyMaintenance';
import { logger } from './utils/logger';

async function startServer(): Promise<void> {
  try {
    const app = createApp();
    const sessionStore = app.locals.sessionStore as { close?: () => void } | undefined;

    // Bootstrap data seed jika belum ada
    await bootstrapSystem();

    // Aktifkan scheduler pemeliharaan harian (14:30 WIB)
    startDailyMaintenanceScheduler();

    const server = app.listen(env.PORT, () => {
      logger.info(
        { port: env.PORT, env: env.NODE_ENV },
        `Server SIKUNJUNG aktif di port ${env.PORT} [Timezone: ${env.TZ}]`
      );
    });

    const shutdown = (signal: string) => {
      logger.info({ signal }, 'Menerima sinyal terminasi, menutup server...');
      server.close(() => {
        sessionStore?.close?.();
        logger.info('Server ditutup.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.fatal({ err }, 'Gagal memulai server SIKUNJUNG');
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}
