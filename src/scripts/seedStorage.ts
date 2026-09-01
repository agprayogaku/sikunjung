import { ensureStorageLayout } from '../bootstrap/ensureStorageLayout';
import { bootstrapSystem } from '../bootstrap/seedData';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  logger.info('Menjalankan proses seeding storage SIKUNJUNG...');
  ensureStorageLayout();
  await bootstrapSystem();
  logger.info('Proses seeding storage selesai.');
}

main().catch((err) => {
  logger.error({ err }, 'Gagal melakukan seed storage');
  process.exit(1);
});
