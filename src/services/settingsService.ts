import fs from 'fs';
import { STORAGE_PATHS } from '../storage/paths';
import { atomicWriteJson, readJsonSafe } from '../storage/jsonStorageEngine';
import { withGlobalLock } from '../storage/fileLockManager';
import { LuggageCategory, SystemSettings } from '../types/settings';
import { logger, writeAuditLog } from '../utils/logger';

let cachedSettings: SystemSettings | null = null;
let lastSettingsMtime = 0;

let cachedItems: LuggageCategory[] | null = null;
let lastItemsMtime = 0;

export function clearSettingsCache(): void {
  cachedSettings = null;
  lastSettingsMtime = 0;
  cachedItems = null;
  lastItemsMtime = 0;
}

export async function getSettings(forceReload = false): Promise<SystemSettings> {
  const filePath = STORAGE_PATHS.SETTINGS_FILE;
  if (!fs.existsSync(filePath)) {
    throw new Error(`File settings tidak ditemukan: ${filePath}`);
  }

  try {
    const stats = await fs.promises.stat(filePath);
    if (cachedSettings && !forceReload && stats.mtimeMs <= lastSettingsMtime) {
      return cachedSettings;
    }

    const settings = await readJsonSafe<SystemSettings>(filePath, {} as SystemSettings);
    cachedSettings = settings;
    lastSettingsMtime = stats.mtimeMs;
    return cachedSettings;
  } catch (err) {
    logger.error({ err, filePath }, 'Gagal membaca settings');
    if (cachedSettings) return cachedSettings;
    throw err;
  }
}

export async function updateSettings(
  partial: Partial<SystemSettings>,
  updatedBy?: string
): Promise<SystemSettings> {
  return await withGlobalLock('config_settings', async () => {
    const current = await getSettings(true);
    const updated: SystemSettings = {
      ...current,
      ...partial
    };

    await atomicWriteJson(STORAGE_PATHS.SETTINGS_FILE, updated);
    cachedSettings = updated;
    lastSettingsMtime = Date.now();

    if (updatedBy) {
      writeAuditLog({
        action: 'SETTINGS_UPDATED',
        actor: updatedBy,
        details: { changes: Object.keys(partial) }
      });
    }

    return updated;
  });
}

export async function getLuggageCategories(forceReload = false): Promise<LuggageCategory[]> {
  const filePath = STORAGE_PATHS.ITEMS_FILE;
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const stats = await fs.promises.stat(filePath);
    if (cachedItems && !forceReload && stats.mtimeMs <= lastItemsMtime) {
      return cachedItems;
    }

    const items = await readJsonSafe<LuggageCategory[]>(filePath, []);
    cachedItems = items;
    lastItemsMtime = stats.mtimeMs;
    return cachedItems;
  } catch (err) {
    logger.error({ err, filePath }, 'Gagal membaca kategori barang');
    return cachedItems ?? [];
  }
}

export async function updateLuggageCategories(
  items: LuggageCategory[],
  updatedBy?: string
): Promise<void> {
  await withGlobalLock('config_items', async () => {
    await atomicWriteJson(STORAGE_PATHS.ITEMS_FILE, items);
    cachedItems = items;
    lastItemsMtime = Date.now();

    if (updatedBy) {
      writeAuditLog({
        action: 'LUGGAGE_CATEGORIES_UPDATED',
        actor: updatedBy,
        details: { count: items.length }
      });
    }
  });
}
