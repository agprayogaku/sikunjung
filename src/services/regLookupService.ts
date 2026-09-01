import { STORAGE_PATHS } from '../storage/paths';
import { atomicWriteJson, readJsonSafe } from '../storage/jsonStorageEngine';
import { withGlobalLock } from '../storage/fileLockManager';
import { logger } from '../utils/logger';

export type RegLookupMap = Record<string, string>; // regNumber -> visitDateStr

export async function findVisitDateByRegNumber(regNumber: string): Promise<string | null> {
  const cleanReg = regNumber.trim().toUpperCase();
  if (!cleanReg) return null;

  try {
    const lookup = await readJsonSafe<RegLookupMap>(STORAGE_PATHS.REG_LOOKUP_FILE, {});
    return lookup[cleanReg] ?? null;
  } catch (err) {
    logger.error({ err, regNumber: cleanReg }, 'Gagal membaca lookup index pendaftaran');
    return null;
  }
}

export async function saveRegNumberLookup(regNumber: string, visitDateStr: string): Promise<void> {
  const cleanReg = regNumber.trim().toUpperCase();
  if (!cleanReg) return;

  await withGlobalLock('reg_lookup', async () => {
    const lookup = await readJsonSafe<RegLookupMap>(STORAGE_PATHS.REG_LOOKUP_FILE, {});
    lookup[cleanReg] = visitDateStr;
    await atomicWriteJson(STORAGE_PATHS.REG_LOOKUP_FILE, lookup);
  });
}
