import fs from 'fs';
import lockfile from 'proper-lockfile';
import { getDateLockFilePath, getGlobalLockFilePath, STORAGE_PATHS } from './paths';
import { ensureDirExists } from './jsonStorageEngine';
import { logger } from '../utils/logger';

function ensureLockFile(lockPath: string): void {
  ensureDirExists(STORAGE_PATHS.LOCKS_DIR);
  if (!fs.existsSync(lockPath)) {
    fs.writeFileSync(lockPath, '', { flag: 'wx' });
  }
}

const DEFAULT_LOCK_OPTIONS = {
  retries: {
    retries: 20,
    factor: 1.5,
    minTimeout: 50,
    maxTimeout: 1000
  },
  stale: 10000 // 10 detik stale timeout
};

export async function withDateLock<T>(visitDateStr: string, callback: () => Promise<T>): Promise<T> {
  const lockFilePath = getDateLockFilePath(visitDateStr);
  ensureLockFile(lockFilePath);

  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(lockFilePath, DEFAULT_LOCK_OPTIONS);
    return await callback();
  } catch (err) {
    logger.error({ err, visitDateStr }, `Gagal memperoleh lock untuk tanggal ${visitDateStr}`);
    throw err;
  } finally {
    if (release) {
      try {
        await release();
      } catch (releaseErr) {
        logger.warn({ releaseErr, visitDateStr }, 'Peringatan saat melepaskan date lock');
      }
    }
  }
}

export async function withGlobalLock<T>(lockName: string, callback: () => Promise<T>): Promise<T> {
  const lockFilePath = getGlobalLockFilePath(lockName);
  ensureLockFile(lockFilePath);

  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(lockFilePath, DEFAULT_LOCK_OPTIONS);
    return await callback();
  } catch (err) {
    logger.error({ err, lockName }, `Gagal memperoleh global lock ${lockName}`);
    throw err;
  } finally {
    if (release) {
      try {
        await release();
      } catch (releaseErr) {
        logger.warn({ releaseErr, lockName }, 'Peringatan saat melepaskan global lock');
      }
    }
  }
}
