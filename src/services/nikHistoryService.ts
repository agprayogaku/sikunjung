import { STORAGE_PATHS } from '../storage/paths';
import { atomicWriteJson, readJsonSafe } from '../storage/jsonStorageEngine';
import { withGlobalLock } from '../storage/fileLockManager';
import { logger } from '../utils/logger';

export interface NikHistoryRecord {
  nama: string;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  alamat: string;
  telepon: string;
  lastRelasi: string;
  lastVisitDate: string;
  totalVisits: number;
}

export type NikHistoryMap = Record<string, NikHistoryRecord>;

export async function getVisitorHistoryByNik(nik: string): Promise<NikHistoryRecord | null> {
  const cleanNik = nik.trim();
  if (cleanNik.length !== 16) return null;

  try {
    const data = await readJsonSafe<NikHistoryMap>(STORAGE_PATHS.NIK_HISTORY_FILE, {});
    return data[cleanNik] ?? null;
  } catch (err) {
    logger.error({ err, nik: cleanNik }, 'Gagal mengambil data riwayat NIK');
    return null;
  }
}

export async function recordVisitorHistories(
  entries: Array<{
    nik: string;
    nama: string;
    jenisKelamin: 'Laki-laki' | 'Perempuan';
    alamat: string;
    telepon?: string;
    relasi: string;
    visitDate: string;
  }>
): Promise<void> {
  if (entries.length === 0) return;

  await withGlobalLock('nik_history', async () => {
    const historyMap = await readJsonSafe<NikHistoryMap>(STORAGE_PATHS.NIK_HISTORY_FILE, {});

    for (const entry of entries) {
      const cleanNik = entry.nik.trim();
      if (cleanNik.length !== 16) continue;

      const existing = historyMap[cleanNik];
      const prevTotal = existing ? existing.totalVisits : 0;
      const prevPhone = existing?.telepon ?? '';

      historyMap[cleanNik] = {
        nama: entry.nama.trim(),
        jenisKelamin: entry.jenisKelamin,
        alamat: entry.alamat.trim(),
        telepon: entry.telepon?.trim() || prevPhone,
        lastRelasi: entry.relasi.trim(),
        lastVisitDate: entry.visitDate,
        totalVisits: prevTotal + 1
      };
    }

    await atomicWriteJson(STORAGE_PATHS.NIK_HISTORY_FILE, historyMap);
  });
}
