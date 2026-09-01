import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export function ensureDirExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export async function readJsonSafe<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = await fs.promises.readFile(filePath, 'utf8');
    if (!content.trim()) {
      return defaultValue;
    }
    return JSON.parse(content) as T;
  } catch (err) {
    logger.error({ err, filePath }, 'Gagal membaca atau mem-parse JSON, mengembalikan default value');
    return defaultValue;
  }
}

export function readJsonSafeSync<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) {
      return defaultValue;
    }
    return JSON.parse(content) as T;
  } catch (err) {
    logger.error({ err, filePath }, 'Gagal membaca atau mem-parse JSON sync, mengembalikan default value');
    return defaultValue;
  }
}

export async function atomicWriteJson<T>(filePath: string, data: T, verify = true): Promise<void> {
  const targetDir = path.dirname(filePath);
  ensureDirExists(targetDir);

  const randSuffix = Math.random().toString(36).slice(2, 8);
  const tempPath = `${filePath}.${Date.now()}.${randSuffix}.tmp`;

  const jsonString = JSON.stringify(data, null, 2);

  try {
    // 1. Tulis ke file temporer
    await fs.promises.writeFile(tempPath, jsonString, 'utf8');

    // 2. Rename atomik ke file target
    await fs.promises.rename(tempPath, filePath);

    // 3. Verifikasi pasca-tulis jika diminta
    if (verify) {
      const readBack = await fs.promises.readFile(filePath, 'utf8');
      JSON.parse(readBack); // Melempar error jika korup
    }
  } catch (err) {
    // Bersihkan file tmp jika masih tersisa
    if (fs.existsSync(tempPath)) {
      try {
        await fs.promises.unlink(tempPath);
      } catch {
        // Abaikan
      }
    }
    logger.error({ err, filePath }, 'Atomic write JSON gagal');
    throw new Error(`Atomic write gagal untuk ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function removeFileSafe(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (err) {
    logger.warn({ err, filePath }, 'Gagal menghapus file');
  }
}
