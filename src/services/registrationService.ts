import crypto from 'crypto';
import { STORAGE_PATHS, getRegistrationFilePath } from '../storage/paths';
import { atomicWriteJson, readJsonSafe } from '../storage/jsonStorageEngine';
import { withDateLock } from '../storage/fileLockManager';
import {
  DailyRegistrationFile,
  RegistrationRecord,
  RegistrationStatus
} from '../types/registration';
import { CreateRegistrationInput } from '../validators/registrationSchema';
import { getWbpById, toPublicSnapshot } from './wbpService';
import { isDateAllowedForWbp } from './scheduleService';
import { getLuggageCategories, getSettings } from './settingsService';
import { findVisitDateByRegNumber, saveRegNumberLookup } from './regLookupService';
import { recordVisitorHistories } from './nikHistoryService';
import { generateVerifyToken } from '../utils/sha256';
import { formatRegistrationNumber, generateRegistrationToken } from '../utils/registrationNumber';
import { getNowInJakarta } from '../utils/dateUtils';
import { logger, writeAuditLog } from '../utils/logger';

const QUOTA_LOCKING_STATUSES = new Set<RegistrationStatus>([
  'MENUNGGU VERIFIKASI',
  'HADIR TERVERIFIKASI',
  'DIPANGGIL',
  'SEDANG BERKUNJUNG',
  'SELESAI'
]);

const QUOTA_RELEASING_STATUSES = new Set<RegistrationStatus>([
  'TIDAK HADIR',
  'DITOLAK',
  'DIBATALKAN'
]);

const ALLOWED_STATUS_TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  'MENUNGGU VERIFIKASI': ['DITOLAK', 'DIBATALKAN', 'TIDAK HADIR'],
  'HADIR TERVERIFIKASI': ['DITOLAK', 'DIBATALKAN', 'TIDAK HADIR', 'SELESAI'],
  DIPANGGIL: ['DIBATALKAN', 'TIDAK HADIR', 'SELESAI'],
  'SEDANG BERKUNJUNG': ['SELESAI'],
  SELESAI: [],
  'TIDAK HADIR': [],
  DITOLAK: [],
  DIBATALKAN: []
};

const REGISTRATION_STATUSES: RegistrationStatus[] = [
  'MENUNGGU VERIFIKASI',
  'HADIR TERVERIFIKASI',
  'DIPANGGIL',
  'SEDANG BERKUNJUNG',
  'SELESAI',
  'TIDAK HADIR',
  'DITOLAK',
  'DIBATALKAN'
];

export function isRegistrationStatus(value: unknown): value is RegistrationStatus {
  return typeof value === 'string' && REGISTRATION_STATUSES.includes(value as RegistrationStatus);
}

function releaseQuotaForRecord(dailyReg: DailyRegistrationFile, record: RegistrationRecord): void {
  const recordNiks = [record.primaryVisitor.nik, ...record.adultFollowers.map((f) => f.nik)];

  dailyReg.guard.activeWbp = dailyReg.guard.activeWbp.filter((id) => id !== record.wbp.wbpId);
  dailyReg.guard.activeNiks = dailyReg.guard.activeNiks.filter((nik) => !recordNiks.includes(nik));
  dailyReg.guard.capacityUsed.registrations = Math.max(0, dailyReg.guard.capacityUsed.registrations - 1);
  dailyReg.guard.capacityUsed.visitors = Math.max(0, dailyReg.guard.capacityUsed.visitors - record.totalVisitors);
}

export function createDefaultDailyRegistration(visitDate: string): DailyRegistrationFile {
  return {
    visitDate,
    updatedAt: getNowInJakarta().toISO() ?? new Date().toISOString(),
    guard: {
      activeWbp: [],
      activeNiks: [],
      capacityUsed: {
        registrations: 0,
        visitors: 0
      }
    },
    records: []
  };
}

export async function getDailyRegistration(visitDateStr: string): Promise<DailyRegistrationFile> {
  const filePath = getRegistrationFilePath(visitDateStr);
  return await readJsonSafe<DailyRegistrationFile>(filePath, createDefaultDailyRegistration(visitDateStr));
}

export async function createRegistration(input: CreateRegistrationInput): Promise<RegistrationRecord> {
  // 1. Ambil data WBP
  const wbp = await getWbpById(input.wbpId);
  if (!wbp) {
    throw new Error('Data WBP tidak ditemukan di dalam sistem.');
  }

  if (wbp.bolehDikunjungi === 'Tidak Boleh Dikunjungi') {
    throw new Error('WBP yang bersangkutan saat ini sedang tidak dapat dikunjungi (dalam status pembinaan/isolasi).');
  }

  if (wbp.bolehDikunjungi === 'Hanya Titipan Barang') {
    throw new Error(
      'WBP yang bersangkutan hanya dapat menerima titipan barang, bukan kunjungan. Pendaftaran kunjungan online tidak dapat diproses.'
    );
  }

  // 2. Ambil Settings
  const settings = await getSettings();

  // 3. Validasi Jadwal Kunjungan (BR-01, BR-02, BR-03)
  const scheduleValidation = isDateAllowedForWbp(input.visitDate, wbp.jenisWbp, {
    closedSpecialDates: settings.closedSpecialDates ?? []
  });

  if (!scheduleValidation.isValid) {
    throw new Error(scheduleValidation.reason ?? 'Tanggal kunjungan tidak diperbolehkan.');
  }

  // 4. Validasi Kategori Barang Titipan (BR-09)
  const categories = await getLuggageCategories();
  const categoryMap = new Map();
  for (const c of categories) {
    categoryMap.set(c.id, c);
    categoryMap.set(c.id.replace(/-/g, ' '), c);
    categoryMap.set(c.id.replace(/\s+/g, '-'), c);
  }

  for (const item of input.luggageItems) {
    const cat = categoryMap.get(item.itemId);
    if (cat && cat.maxQuantity > 0 && item.quantity > cat.maxQuantity) {
      throw new Error(
        `Jumlah untuk ${cat.name} melebihi batas maksimal yang diperbolehkan (${cat.maxQuantity} ${cat.unit}).`
      );
    }
  }

  // 5. Eksekusi dengan Date Lock Atomik
  return await withDateLock(input.visitDate, async () => {
    const dailyReg = await getDailyRegistration(input.visitDate);

    const totalAdults = 1 + input.adultFollowers.length;
    const totalVisitors = totalAdults + input.childrenCount;

    // 5a. Cek Kapasitas Harian (BR-05 & BR-06)
    const maxRegs = settings.maxDailyRegistrations || 40;
    const maxVisitors = settings.maxDailyVisitors || 60;

    if (dailyReg.guard.capacityUsed.registrations + 1 > maxRegs) {
      throw new Error(`Kuota pendaftaran harian untuk tanggal ini telah penuh (maksimal ${maxRegs} pendaftaran).`);
    }

    if (dailyReg.guard.capacityUsed.visitors + totalVisitors > maxVisitors) {
      const remaining = Math.max(0, maxVisitors - dailyReg.guard.capacityUsed.visitors);
      throw new Error(
        `Kapasitas pengunjung untuk tanggal ini tidak mencukupi (sisa kuota: ${remaining} orang, dibutuhkan: ${totalVisitors} orang).`
      );
    }

    // 5b. Cek 1 WBP 1 Kunjungan per Hari (BR-05)
    if (dailyReg.guard.activeWbp.includes(input.wbpId)) {
      throw new Error('Warga Binaan Pemasyarakatan (WBP) ini sudah terdaftar untuk kunjungan pada tanggal yang dipilih.');
    }

    // 5c. Cek Keunikan NIK Pengunjung pada Tanggal Tersebut (BR-07)
    const allNiks = [input.primaryVisitor.nik, ...input.adultFollowers.map((f) => f.nik)];
    for (const nik of allNiks) {
      if (dailyReg.guard.activeNiks.includes(nik)) {
        throw new Error(`Pengunjung dengan NIK ${nik} sudah terdaftar dalam kunjungan aktif pada tanggal tersebut.`);
      }
    }

    // 5d. Generate Nomor Registrasi Acak (BR-08)
    let registrationNumber = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = formatRegistrationNumber(input.visitDate, generateRegistrationToken());
      if (!dailyReg.records.some((r) => r.registrationNumber === candidate)) {
        registrationNumber = candidate;
        break;
      }
    }

    if (!registrationNumber) {
      throw new Error('Gagal membuat nomor registrasi unik. Silakan coba lagi.');
    }

    const nowIso = getNowInJakarta().toISO() ?? new Date().toISOString();
    const verifyToken = generateVerifyToken(16);

    const publicSnapshot = toPublicSnapshot(wbp);

    const record: RegistrationRecord = {
      id: crypto.randomUUID(),
      registrationNumber,
      verifyToken,
      createdAt: nowIso,
      visitDate: input.visitDate,
      status: 'MENUNGGU VERIFIKASI',
      wbp: {
        ...publicSnapshot,
        lokasiSel: wbp.lokasiSel // Disimpan untuk kebutuhan admin/petugas
      },
      primaryVisitor: input.primaryVisitor,
      adultFollowers: input.adultFollowers,
      childrenCount: input.childrenCount,
      totalAdults,
      totalVisitors,
      luggageItems: input.luggageItems.map((item) => ({
        itemId: item.itemId,
        itemName: item.itemName,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes
      })),
      statusHistory: [
        {
          status: 'MENUNGGU VERIFIKASI',
          changedAt: nowIso,
          changedBy: 'Pengunjung (Online)'
        }
      ]
    };

    // 5e. Update Guard
    dailyReg.guard.activeWbp.push(input.wbpId);
    dailyReg.guard.activeNiks.push(...allNiks);
    dailyReg.guard.capacityUsed.registrations += 1;
    dailyReg.guard.capacityUsed.visitors += totalVisitors;
    dailyReg.updatedAt = nowIso;
    dailyReg.records.push(record);

    // 5f. Tulis File Registrasi Harian Atomik
    const filePath = getRegistrationFilePath(input.visitDate);
    await atomicWriteJson(filePath, dailyReg);

    // 5g. Update Indeks Reg Lookup & NIK History
    await saveRegNumberLookup(registrationNumber, input.visitDate);

    const historyEntries = [
      {
        nik: input.primaryVisitor.nik,
        nama: input.primaryVisitor.nama,
        jenisKelamin: input.primaryVisitor.jenisKelamin,
        alamat: input.primaryVisitor.alamat,
        telepon: input.primaryVisitor.telepon,
        relasi: input.primaryVisitor.relasi,
        visitDate: input.visitDate
      },
      ...input.adultFollowers.map((f) => ({
        nik: f.nik,
        nama: f.nama,
        jenisKelamin: f.jenisKelamin,
        alamat: f.alamat,
        relasi: f.relasi,
        visitDate: input.visitDate
      }))
    ];

    await recordVisitorHistories(historyEntries);

    logger.info({ registrationNumber, visitDate: input.visitDate }, 'Pendaftaran kunjungan berhasil dibuat');
    return record;
  });
}

export async function getRegistrationByNumber(regNumber: string): Promise<RegistrationRecord | null> {
  const visitDate = await findVisitDateByRegNumber(regNumber);
  if (!visitDate) return null;

  const dailyReg = await getDailyRegistration(visitDate);
  return dailyReg.records.find((r) => r.registrationNumber === regNumber.trim().toUpperCase()) ?? null;
}

export async function cancelRegistration(
  regNumber: string,
  primaryNik: string,
  reason?: string,
  cancelledBy = 'Pengunjung'
): Promise<RegistrationRecord> {
  const visitDate = await findVisitDateByRegNumber(regNumber);
  if (!visitDate) {
    throw new Error(`Pendaftaran dengan nomor ${regNumber} tidak ditemukan.`);
  }

  return await withDateLock(visitDate, async () => {
    const dailyReg = await getDailyRegistration(visitDate);
    const record = dailyReg.records.find((r) => r.registrationNumber === regNumber.trim().toUpperCase());

    if (!record) {
      throw new Error(`Pendaftaran dengan nomor ${regNumber} tidak ditemukan.`);
    }

    if (record.primaryVisitor.nik.trim() !== primaryNik.trim()) {
      throw new Error('NIK pendaftar utama tidak cocok.');
    }

    if (record.status !== 'MENUNGGU VERIFIKASI') {
      throw new Error(`Pendaftaran dengan status "${record.status}" tidak dapat dibatalkan.`);
    }

    const nowIso = getNowInJakarta().toISO() ?? new Date().toISOString();
    record.status = 'DIBATALKAN';
    record.statusHistory.push({
      status: 'DIBATALKAN',
      changedAt: nowIso,
      changedBy: cancelledBy,
      reason: reason || 'Dibatalkan oleh pengunjung secara mandiri'
    });

    // Bebaskan Kuota Guard (BR-10)
    releaseQuotaForRecord(dailyReg, record);
    dailyReg.updatedAt = nowIso;

    const filePath = getRegistrationFilePath(visitDate);
    await atomicWriteJson(filePath, dailyReg);

    writeAuditLog({
      action: 'REGISTRATION_CANCELLED',
      actor: cancelledBy,
      details: { registrationNumber: regNumber, visitDate, reason }
    });

    return record;
  });
}

export async function updateRegistrationStatus(
  regNumber: string,
  newStatus: RegistrationStatus,
  changedBy: string,
  reason?: string
): Promise<RegistrationRecord> {
  if (!isRegistrationStatus(newStatus)) {
    throw new Error('Status pendaftaran tidak valid.');
  }

  const visitDate = await findVisitDateByRegNumber(regNumber);
  if (!visitDate) {
    throw new Error(`Pendaftaran dengan nomor ${regNumber} tidak ditemukan.`);
  }

  return await withDateLock(visitDate, async () => {
    const dailyReg = await getDailyRegistration(visitDate);
    const record = dailyReg.records.find((r) => r.registrationNumber === regNumber.trim().toUpperCase());

    if (!record) {
      throw new Error(`Pendaftaran dengan nomor ${regNumber} tidak ditemukan.`);
    }

    const prevStatus = record.status;

    if (prevStatus === newStatus) {
      throw new Error(`Pendaftaran sudah berstatus "${newStatus}".`);
    }

    if (!ALLOWED_STATUS_TRANSITIONS[prevStatus].includes(newStatus)) {
      throw new Error(
        `Perubahan status dari "${prevStatus}" ke "${newStatus}" tidak diizinkan.`
      );
    }

    const nowIso = getNowInJakarta().toISO() ?? new Date().toISOString();
    record.status = newStatus;
    record.statusHistory.push({
      status: newStatus,
      changedAt: nowIso,
      changedBy,
      reason
    });

    // Kuota hanya dibebaskan sekali, yaitu saat status berubah dari status
    // pengunci kuota menjadi status pembebas kuota (BR-07).
    if (
      QUOTA_LOCKING_STATUSES.has(prevStatus) &&
      QUOTA_RELEASING_STATUSES.has(newStatus)
    ) {
      releaseQuotaForRecord(dailyReg, record);
    }

    dailyReg.updatedAt = nowIso;
    const filePath = getRegistrationFilePath(visitDate);
    await atomicWriteJson(filePath, dailyReg);

    writeAuditLog({
      action: 'REGISTRATION_STATUS_UPDATED',
      actor: changedBy,
      details: { registrationNumber: regNumber, from: prevStatus, to: newStatus, reason }
    });

    return record;
  });
}
