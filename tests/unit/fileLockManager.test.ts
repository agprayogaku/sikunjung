import { withDateLock, withGlobalLock } from '../../src/storage/fileLockManager';
import { STORAGE_PATHS } from '../../src/storage/paths';
import { ensureStorageLayout } from '../../src/bootstrap/ensureStorageLayout';

describe('File Lock Manager (proper-lockfile)', () => {
  beforeAll(() => {
    ensureStorageLayout();
  });

  it('berhasil memperoleh dan melepaskan date lock untuk tanggal kunjungan', async () => {
    const testDate = '2026-11-10';
    let executed = false;

    const result = await withDateLock(testDate, async () => {
      executed = true;
      return 'lock_success';
    });

    expect(executed).toBe(true);
    expect(result).toBe('lock_success');
  });

  it('menjamin eksekusi sekuensial saat dua proses mengakses date lock yang sama secara paralel', async () => {
    const testDate = '2026-11-12';
    const executionOrder: number[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;

    const task1 = withDateLock(testDate, async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 60));
      executionOrder.push(1);
      concurrent--;
      return 1;
    });

    const task2 = withDateLock(testDate, async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 30));
      executionOrder.push(2);
      concurrent--;
      return 2;
    });

    const results = await Promise.all([task1, task2]);

    expect(maxConcurrent).toBe(1); // Menjamin tidak pernah tumpang-tindih (mutual exclusion)
    expect(results.sort()).toEqual([1, 2]);
    expect(executionOrder.length).toBe(2);
  });

  it('berhasil memperoleh dan melepaskan global lock', async () => {
    const lockName = 'settings_update_test';
    const result = await withGlobalLock(lockName, async () => {
      return 'global_ok';
    });

    expect(result).toBe('global_ok');
  });
});
