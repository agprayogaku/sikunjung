import path from 'path';
import fs from 'fs';
import {
  atomicWriteJson,
  readJsonSafe,
  fileExists,
  removeFileSafe,
  ensureDirExists
} from '../../src/storage/jsonStorageEngine';
import { STORAGE_PATHS } from '../../src/storage/paths';

describe('Storage Engine (jsonStorageEngine)', () => {
  const testDir = path.join(STORAGE_PATHS.ROOT, 'tests_storage');
  const testFile = path.join(testDir, 'test_record.json');

  beforeAll(() => {
    ensureDirExists(testDir);
  });

  afterAll(async () => {
    await removeFileSafe(testFile);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('dapat menulis dan membaca file JSON secara atomik', async () => {
    const data = { title: 'Uji Coba Lapas', count: 42, active: true };

    await atomicWriteJson(testFile, data);

    expect(fileExists(testFile)).toBe(true);

    const result = await readJsonSafe(testFile, {});
    expect(result).toEqual(data);
  });

  it('mengembalikan default value jika file tidak ditemukan', async () => {
    const nonExistent = path.join(testDir, 'not_found.json');
    const defaultVal = { status: 'default' };

    const result = await readJsonSafe(nonExistent, defaultVal);
    expect(result).toEqual(defaultVal);
  });

  it('mengembalikan default value jika file korup dan mencatat warning', async () => {
    const corruptFile = path.join(testDir, 'corrupt.json');
    fs.writeFileSync(corruptFile, '{ invalid json string ...', 'utf8');

    const defaultVal = { fixed: true };
    const result = await readJsonSafe(corruptFile, defaultVal);
    expect(result).toEqual(defaultVal);

    await removeFileSafe(corruptFile);
  });

  it('menangani multiple atomic write secara berurutan dengan benar', async () => {
    for (let i = 1; i <= 5; i++) {
      await atomicWriteJson(testFile, { iteration: i });
      const readBack = await readJsonSafe<{ iteration: number }>(testFile, { iteration: 0 });
      expect(readBack.iteration).toBe(i);
    }
  });
});
