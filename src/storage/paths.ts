import path from 'path';

const BASE_STORAGE_DIR = process.env.STORAGE_ROOT
  ? path.resolve(process.env.STORAGE_ROOT)
  : path.resolve(process.cwd(), 'storage');

export const STORAGE_PATHS = {
  ROOT: BASE_STORAGE_DIR,
  WBP_DIR: path.join(BASE_STORAGE_DIR, 'wbp'),
  WBP_DATA_FILE: path.join(BASE_STORAGE_DIR, 'wbp', 'data.json'),
  WBP_BACKUPS_DIR: path.join(BASE_STORAGE_DIR, 'wbp', 'backups'),
  REGISTRATIONS_DIR: path.join(BASE_STORAGE_DIR, 'registrations'),
  QUEUES_DIR: path.join(BASE_STORAGE_DIR, 'queues'),
  INDEXES_DIR: path.join(BASE_STORAGE_DIR, 'indexes'),
  NIK_HISTORY_FILE: path.join(BASE_STORAGE_DIR, 'indexes', 'nik_history.json'),
  REG_LOOKUP_FILE: path.join(BASE_STORAGE_DIR, 'indexes', 'reg_lookup.json'),
  CONFIG_DIR: path.join(BASE_STORAGE_DIR, 'config'),
  SETTINGS_FILE: path.join(BASE_STORAGE_DIR, 'config', 'settings.json'),
  ITEMS_FILE: path.join(BASE_STORAGE_DIR, 'config', 'items.json'),
  ADMINS_FILE: path.join(BASE_STORAGE_DIR, 'config', 'admins.json'),
  PENDING_RESETS_FILE: path.join(BASE_STORAGE_DIR, 'config', 'pending_password_resets.json'),
  LOCKS_DIR: path.join(BASE_STORAGE_DIR, 'locks'),
  SESSIONS_DIR: path.join(BASE_STORAGE_DIR, 'sessions'),
  SESSIONS_DB_FILE: path.join(BASE_STORAGE_DIR, 'sessions', 'sessions.db'),
  LOGS_DIR: path.join(BASE_STORAGE_DIR, 'logs'),
  BACKUPS_DIR: path.join(BASE_STORAGE_DIR, 'backups'),
  AUTO_BACKUPS_DIR: path.join(BASE_STORAGE_DIR, 'backups', 'auto'),
  MANUAL_BACKUPS_DIR: path.join(BASE_STORAGE_DIR, 'backups', 'manual')
};

export function getRegistrationFilePath(visitDateStr: string): string {
  // visitDateStr: YYYY-MM-DD
  const monthDir = visitDateStr.slice(0, 7); // YYYY-MM
  return path.join(STORAGE_PATHS.REGISTRATIONS_DIR, monthDir, `reg_${visitDateStr}.json`);
}

export function getQueueFilePath(visitDateStr: string): string {
  return path.join(STORAGE_PATHS.QUEUES_DIR, `queue_${visitDateStr}.json`);
}

export function getDateLockFilePath(visitDateStr: string): string {
  return path.join(STORAGE_PATHS.LOCKS_DIR, `date_${visitDateStr}.lock`);
}

export function getGlobalLockFilePath(name: string): string {
  return path.join(STORAGE_PATHS.LOCKS_DIR, `global_${name}.lock`);
}
