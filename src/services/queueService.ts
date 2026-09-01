import { DateTime } from 'luxon';
import { getQueueFilePath, getRegistrationFilePath } from '../storage/paths';
import { atomicWriteJson, readJsonSafe } from '../storage/jsonStorageEngine';
import { withDateLock } from '../storage/fileLockManager';
import { DailyQueueFile, QueueEntry, QueueStatus } from '../types/queue';
import { DailyRegistrationFile, RegistrationRecord, RegistrationStatus } from '../types/registration';
import { findVisitDateByRegNumber } from './regLookupService';
import { getDailyRegistration } from './registrationService';
import { getNowInJakarta } from '../utils/dateUtils';
import { logger, writeAuditLog } from '../utils/logger';

const QUEUE_STATUSES: QueueStatus[] = [
  'MENUNGGU DIPANGGIL',
  'DIPANGGIL',
  'SEDANG BERKUNJUNG',
  'SELESAI',
  'DILEWATI'
];

const ALLOWED_QUEUE_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  'MENUNGGU DIPANGGIL': ['DIPANGGIL', 'DILEWATI'],
  DIPANGGIL: ['SEDANG BERKUNJUNG', 'DILEWATI'],
  'SEDANG BERKUNJUNG': ['SELESAI'],
  SELESAI: [],
  DILEWATI: []
};

export function createDefaultDailyQueue(visitDate: string): DailyQueueFile {
  return {
    visitDate,
    lastNumber: 0,
    entries: []
  };
}

export async function getDailyQueue(visitDateStr: string): Promise<DailyQueueFile> {
  const filePath = getQueueFilePath(visitDateStr);
  return await readJsonSafe<DailyQueueFile>(filePath, createDefaultDailyQueue(visitDateStr));
}

export async function verifyArrival(
  regNumber: string,
  adminUsername: string,
  now: DateTime = getNowInJakarta()
): Promise<{ registration: RegistrationRecord; queueEntry: QueueEntry }> {
  const cleanReg = regNumber.trim().toUpperCase();
  const visitDate = await findVisitDateByRegNumber(cleanReg);

  if (!visitDate) {
    throw new Error(`Pendaftaran dengan nomor ${cleanReg} tidak ditemukan di sistem.`);
  }

  const todayStr = now.toFormat('yyyy-MM-dd');
  if (visitDate !== todayStr) {
    throw new Error(
      `Pendaftaran ${cleanReg} hanya dapat diverifikasi pada tanggal kunjungan (${visitDate}). Hari ini ${todayStr}.`
    );
  }

  return await withDateLock(visitDate, async () => {
    // 1. Muat registrasi harian
    const dailyReg = await getDailyRegistration(visitDate);
    const record = dailyReg.records.find((r) => r.registrationNumber === cleanReg);

    if (!record) {
      throw new Error(`Pendaftaran dengan nomor ${cleanReg} tidak ditemukan.`);
    }

    if (record.status !== 'MENUNGGU VERIFIKASI') {
      throw new Error(
        `Pendaftaran ${cleanReg} tidak dapat diverifikasi karena saat ini berstatus "${record.status}".`
      );
    }

    // 2. Muat antrean harian
    const dailyQueue = await getDailyQueue(visitDate);

    // 3. Terbitkan nomor antrean sekuensial (BR-08: format 'A 001')
    const nextSequence = dailyQueue.lastNumber + 1;
    const queueNumber = `A ${nextSequence.toString().padStart(3, '0')}`;
    const nowIso = getNowInJakarta().toISO() ?? new Date().toISOString();

    const queueEntry: QueueEntry = {
      queueNumber,
      sequence: nextSequence,
      regNumber: cleanReg,
      wbpName: record.wbp.nama,
      primaryName: record.primaryVisitor.nama,
      totalVisitors: record.totalVisitors,
      verifiedAt: nowIso,
      status: 'MENUNGGU DIPANGGIL',
      statusHistory: [
        {
          status: 'MENUNGGU DIPANGGIL',
          changedAt: nowIso
        }
      ]
    };

    dailyQueue.lastNumber = nextSequence;
    dailyQueue.entries.push(queueEntry);

    // 4. Update status registrasi
    record.status = 'HADIR TERVERIFIKASI';
    record.queueInfo = {
      queueNumber,
      queueSequence: nextSequence,
      queueStatus: 'MENUNGGU DIPANGGIL',
      verifiedAt: nowIso,
      verifiedBy: adminUsername
    };
    record.statusHistory.push({
      status: 'HADIR TERVERIFIKASI',
      changedAt: nowIso,
      changedBy: adminUsername,
      reason: `Verifikasi fisik loket oleh ${adminUsername}`
    });
    dailyReg.updatedAt = nowIso;

    // 5. Tulis kedua file secara atomik
    await atomicWriteJson(getQueueFilePath(visitDate), dailyQueue);
    await atomicWriteJson(getRegistrationFilePath(visitDate), dailyReg);

    // 6. Catat audit log
    writeAuditLog({
      action: 'ARRIVAL_VERIFIED',
      actor: adminUsername,
      details: {
        registrationNumber: cleanReg,
        queueNumber,
        visitDate
      }
    });

    logger.info({ cleanReg, queueNumber, visitDate }, 'Kedatangan pengunjung berhasil diverifikasi');
    return { registration: record, queueEntry };
  });
}

export async function updateQueueStatus(
  visitDateStr: string,
  queueNumber: string,
  newStatus: QueueStatus,
  adminUsername: string
): Promise<QueueEntry> {
  const cleanQueue = queueNumber.trim().toUpperCase();

  if (!QUEUE_STATUSES.includes(newStatus)) {
    throw new Error('Status antrean tidak valid.');
  }

  return await withDateLock(visitDateStr, async () => {
    const dailyQueue = await getDailyQueue(visitDateStr);
    const entry = dailyQueue.entries.find((e) => e.queueNumber === cleanQueue);

    if (!entry) {
      throw new Error(`Nomor antrean ${cleanQueue} tidak ditemukan pada tanggal ${visitDateStr}.`);
    }

    if (entry.status === newStatus) {
      throw new Error(`Antrean sudah berstatus "${newStatus}".`);
    }

    if (!ALLOWED_QUEUE_TRANSITIONS[entry.status].includes(newStatus)) {
      throw new Error(
        `Perubahan status antrean dari "${entry.status}" ke "${newStatus}" tidak diizinkan.`
      );
    }

    const nowIso = getNowInJakarta().toISO() ?? new Date().toISOString();
    entry.status = newStatus;
    entry.statusHistory.push({
      status: newStatus,
      changedAt: nowIso
    });

    // Sinkronkan ke data registrasi jika relevan
    const dailyReg = await getDailyRegistration(visitDateStr);
    const record = dailyReg.records.find((r) => r.registrationNumber === entry.regNumber);

    if (record) {
      if (record.queueInfo) {
        record.queueInfo.queueStatus = newStatus;
      }

      let regStatusToSync: RegistrationStatus | null = null;
      if (newStatus === 'DIPANGGIL') regStatusToSync = 'DIPANGGIL';
      else if (newStatus === 'SEDANG BERKUNJUNG') regStatusToSync = 'SEDANG BERKUNJUNG';
      else if (newStatus === 'SELESAI') regStatusToSync = 'SELESAI';

      if (regStatusToSync && record.status !== regStatusToSync) {
        record.status = regStatusToSync;
        record.statusHistory.push({
          status: regStatusToSync,
          changedAt: nowIso,
          changedBy: adminUsername,
          reason: `Status antrean diubah menjadi ${newStatus}`
        });
      }

      dailyReg.updatedAt = nowIso;
      await atomicWriteJson(getRegistrationFilePath(visitDateStr), dailyReg);
    }

    await atomicWriteJson(getQueueFilePath(visitDateStr), dailyQueue);

    writeAuditLog({
      action: 'QUEUE_STATUS_UPDATED',
      actor: adminUsername,
      details: {
        queueNumber: cleanQueue,
        status: newStatus,
        visitDate: visitDateStr
      }
    });

    return entry;
  });
}
