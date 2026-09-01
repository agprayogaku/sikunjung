import fs from 'fs';
import { STORAGE_PATHS } from '../storage/paths';
import { ensureDirExists, fileExists } from '../storage/jsonStorageEngine';
import { logger } from '../utils/logger';

export function ensureStorageLayout(): void {
  const dirs = [
    STORAGE_PATHS.ROOT,
    STORAGE_PATHS.WBP_DIR,
    STORAGE_PATHS.WBP_BACKUPS_DIR,
    STORAGE_PATHS.REGISTRATIONS_DIR,
    STORAGE_PATHS.QUEUES_DIR,
    STORAGE_PATHS.INDEXES_DIR,
    STORAGE_PATHS.CONFIG_DIR,
    STORAGE_PATHS.LOCKS_DIR,
    STORAGE_PATHS.SESSIONS_DIR,
    STORAGE_PATHS.LOGS_DIR,
    STORAGE_PATHS.BACKUPS_DIR,
    STORAGE_PATHS.AUTO_BACKUPS_DIR,
    STORAGE_PATHS.MANUAL_BACKUPS_DIR
  ];

  for (const dir of dirs) {
    ensureDirExists(dir);
  }

  // Inisialisasi berkas indeks default jika belum ada
  if (!fileExists(STORAGE_PATHS.NIK_HISTORY_FILE)) {
    fs.writeFileSync(STORAGE_PATHS.NIK_HISTORY_FILE, JSON.stringify({}, null, 2), 'utf8');
  }

  if (!fileExists(STORAGE_PATHS.REG_LOOKUP_FILE)) {
    fs.writeFileSync(STORAGE_PATHS.REG_LOOKUP_FILE, JSON.stringify({}, null, 2), 'utf8');
  }

  if (!fileExists(STORAGE_PATHS.PENDING_RESETS_FILE)) {
    fs.writeFileSync(STORAGE_PATHS.PENDING_RESETS_FILE, JSON.stringify([], null, 2), 'utf8');
  }

  logger.info('Layout direktori storage berhasil diverifikasi dan disiapkan.');
}
