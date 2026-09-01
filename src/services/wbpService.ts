import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { STORAGE_PATHS } from '../storage/paths';
import { atomicWriteJson, ensureDirExists, readJsonSafe } from '../storage/jsonStorageEngine';
import { withGlobalLock } from '../storage/fileLockManager';
import { BolehDikunjungi, RawWbpRecord, WbpPublicSnapshot, WbpRecord, WbpType } from '../types/wbp';
import { calculateAge, getNowInJakarta } from '../utils/dateUtils';
import { computeWbpDeterministicId } from '../utils/sha256';
import { validateWbpUploadData } from '../validators/wbpJsonSchema';
import { logger, writeAuditLog } from '../utils/logger';

let cachedWbpList: WbpRecord[] | null = null;
let lastLoadedMtime = 0;

export function clearWbpCache(): void {
  cachedWbpList = null;
  lastLoadedMtime = 0;
}

export function normalizeWbpRecord(raw: RawWbpRecord, index: number, referenceDateIso?: string): WbpRecord {
  const noRegInstansi = (raw['No Reg Instansi'] ?? '').trim();
  const nama = (raw.Nama ?? '').trim().toUpperCase();
  const tanggalLahir = (raw['Tanggal Lahir'] ?? '').trim();
  const tanggalMasuk = (raw['Tanggal Masuk'] ?? '').trim();
  const lokasiSel = (raw['Lokasi Sel'] ?? '').trim();

  const rawPutus = (raw['Putus Sidang'] ?? '').trim().toLowerCase();
  const putusSidang: 'Sudah' | 'Belum' = rawPutus === 'sudah' ? 'Sudah' : 'Belum';

  // Putus Sidang adalah sumber kebenaran status WBP.
  // Field 'Jenis WBP' tetap diterima untuk kompatibilitas upload lama.
  const jenisWbp: WbpType = putusSidang === 'Sudah' ? 'Narapidana' : 'Tahanan';
  const bolehDikunjungi = (raw['Boleh Dikunjungi'] as BolehDikunjungi) || 'Boleh Dikunjungi';

  const wbpId = computeWbpDeterministicId(noRegInstansi, nama, tanggalLahir);
  const usia = calculateAge(tanggalLahir, referenceDateIso);

  return {
    no: typeof raw.No === 'number' ? raw.No : index + 1,
    wbpId,
    noRegInstansi,
    nama,
    tanggalLahir,
    usia,
    tanggalMasuk,
    lokasiSel,
    putusSidang,
    jenisWbp,
    bolehDikunjungi
  };
}

export function toPublicSnapshot(wbp: WbpRecord): WbpPublicSnapshot {
  return {
    wbpId: wbp.wbpId,
    nama: wbp.nama,
    tanggalLahir: wbp.tanggalLahir,
    usia: wbp.usia,
    tanggalMasuk: wbp.tanggalMasuk,
    putusSidang: wbp.putusSidang,
    jenisWbp: wbp.jenisWbp,
    bolehDikunjungi: wbp.bolehDikunjungi
  };
}

export async function getAllWbp(forceReload = false): Promise<WbpRecord[]> {
  const filePath = STORAGE_PATHS.WBP_DATA_FILE;

  if (!fs.existsSync(filePath)) {
    cachedWbpList = [];
    return [];
  }

  try {
    const stats = await fs.promises.stat(filePath);
    if (cachedWbpList && !forceReload && stats.mtimeMs <= lastLoadedMtime) {
      return cachedWbpList;
    }

    const rawList = await readJsonSafe<RawWbpRecord[]>(filePath, []);
    const normalizedList: WbpRecord[] = rawList.map((item, idx) => normalizeWbpRecord(item, idx));

    cachedWbpList = normalizedList;
    lastLoadedMtime = stats.mtimeMs;
    return cachedWbpList;
  } catch (err) {
    logger.error({ err, filePath }, 'Gagal memuat data WBP dari storage');
    return cachedWbpList ?? [];
  }
}

export async function getWbpById(wbpId: string): Promise<WbpRecord | null> {
  const all = await getAllWbp();
  return all.find((w) => w.wbpId === wbpId) ?? null;
}

export async function getWbpPublicSnapshot(wbpId: string): Promise<WbpPublicSnapshot | null> {
  const wbp = await getWbpById(wbpId);
  return wbp ? toPublicSnapshot(wbp) : null;
}

export async function searchWbp(query: string, limit = 25): Promise<WbpPublicSnapshot[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ').toLowerCase();

  // Perlindungan privasi dan performa: minimal 2 karakter untuk pencarian
  if (normalizedQuery.length < 2) {
    return [];
  }

  const all = await getAllWbp();
  const matched = all.filter((w) => {
    const normalizedName = w.nama.replace(/\s+/g, ' ').toLowerCase();
    return normalizedName.includes(normalizedQuery);
  });

  return matched.slice(0, limit).map(toPublicSnapshot);
}

export async function updateWbpVisitingStatus(
  wbpId: string,
  status: BolehDikunjungi,
  adminUsername?: string
): Promise<WbpRecord> {
  return await withGlobalLock('wbp_data', async () => {
    const rawList = await readJsonSafe<RawWbpRecord[]>(STORAGE_PATHS.WBP_DATA_FILE, []);
    let updatedIndex = -1;

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      if (!item) continue;
      const id = computeWbpDeterministicId(
        item['No Reg Instansi'] ?? '',
        item.Nama ?? '',
        item['Tanggal Lahir'] ?? ''
      );
      if (id === wbpId) {
        updatedIndex = i;
        item['Boleh Dikunjungi'] = status;
        break;
      }
    }

    if (updatedIndex === -1) {
      throw new Error(`WBP dengan ID ${wbpId} tidak ditemukan`);
    }

    await atomicWriteJson(STORAGE_PATHS.WBP_DATA_FILE, rawList);
    clearWbpCache();

    if (adminUsername) {
      writeAuditLog({
        action: 'WBP_STATUS_UPDATE',
        actor: adminUsername,
        details: { wbpId, status }
      });
    }

    const updatedRaw = rawList[updatedIndex]!;
    return normalizeWbpRecord(updatedRaw, updatedIndex);
  });
}

export async function replaceWbpData(
  newRawData: unknown,
  uploadedBy: string
): Promise<{ count: number; backupPath: string }> {
  const validated = validateWbpUploadData(newRawData);

  return await withGlobalLock('wbp_data', async () => {
    ensureDirExists(STORAGE_PATHS.WBP_BACKUPS_DIR);

    // 1. Buat backup dari data lama jika ada
    let backupPath = '';
    if (fs.existsSync(STORAGE_PATHS.WBP_DATA_FILE)) {
      const nowStr = getNowInJakarta().toFormat('yyyyMMdd_HHmmss');
      backupPath = path.join(STORAGE_PATHS.WBP_BACKUPS_DIR, `data_${nowStr}.json`);
      const currentData = await fs.promises.readFile(STORAGE_PATHS.WBP_DATA_FILE, 'utf8');
      await fs.promises.writeFile(backupPath, currentData, 'utf8');
    }

    // 2. Tulis data baru secara atomik
    await atomicWriteJson(STORAGE_PATHS.WBP_DATA_FILE, validated);
    clearWbpCache();

    // 3. Catat audit log
    writeAuditLog({
      action: 'WBP_DATA_REPLACED',
      actor: uploadedBy,
      details: {
        count: validated.length,
        backupPath
      }
    });

    return {
      count: validated.length,
      backupPath
    };
  });
}
