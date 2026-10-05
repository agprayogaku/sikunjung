import fs from 'fs';
import {
  createRegistration,
  getRegistrationByNumber
} from '../../src/services/registrationService';
import {
  getDailyQueue,
  updateQueueStatus,
  verifyArrival
} from '../../src/services/queueService';
import { replaceWbpData } from '../../src/services/wbpService';
import { getQueueFilePath, getRegistrationFilePath } from '../../src/storage/paths';
import { parseDateJakarta } from '../../src/utils/dateUtils';
import { getUpcomingVisitDate } from '../helpers/visitDate';

describe('Queue Service & In-Person Verification Tests (BR-08, TC 21, TC 22)', () => {
  let sampleWbpId1: string;
  let sampleWbpId2: string;
  let testVisitDate: string;

  const sampleData = [
    {
      No: 1,
      'No Reg Instansi': 'Q-REG-001',
      Nama: 'WBP ANTRIAN SATU',
      'Tanggal Lahir': '1980-01-01',
      'Tanggal Masuk': '2024-12-19',
      'Lokasi Sel': 'Blok A.01',
      'Putus Sidang': 'Sudah',
      'Jenis WBP': 'Narapidana'
    },
    {
      No: 2,
      'No Reg Instansi': 'Q-REG-002',
      Nama: 'WBP ANTRIAN DUA',
      'Tanggal Lahir': '1982-02-02',
      'Tanggal Masuk': '2024-12-19',
      'Lokasi Sel': 'Blok A.02',
      'Putus Sidang': 'Sudah',
      'Jenis WBP': 'Narapidana'
    }
  ];

  beforeAll(async () => {
    testVisitDate = getUpcomingVisitDate('Narapidana');
  });

  function visitDayNow() {
    return parseDateJakarta(testVisitDate).set({
      hour: 9,
      minute: 0,
      second: 0,
      millisecond: 0
    });
  }

  beforeEach(async () => {
    await replaceWbpData(sampleData, 'queue_test');
    const { getAllWbp } = await import('../../src/services/wbpService');
    const all = await getAllWbp(true);
    sampleWbpId1 = all[0]!.wbpId;
    sampleWbpId2 = all[1]!.wbpId;

    const regPath = getRegistrationFilePath(testVisitDate);
    if (fs.existsSync(regPath)) {
      try {
        fs.unlinkSync(regPath);
      } catch {}
    }
    const qPath = getQueueFilePath(testVisitDate);
    if (fs.existsSync(qPath)) {
      try {
        fs.unlinkSync(qPath);
      } catch {}
    }
    const { STORAGE_PATHS } = await import('../../src/storage/paths');
    if (fs.existsSync(STORAGE_PATHS.REG_LOOKUP_FILE)) {
      try {
        fs.unlinkSync(STORAGE_PATHS.REG_LOOKUP_FILE);
      } catch {}
    }
    if (fs.existsSync(STORAGE_PATHS.NIK_HISTORY_FILE)) {
      try {
        fs.unlinkSync(STORAGE_PATHS.NIK_HISTORY_FILE);
      } catch {}
    }
  });

  it('TC 21: verifikasi kedatangan pertama menerbitkan nomor antrean "A 001" dan status HADIR TERVERIFIKASI', async () => {
    const reg = await createRegistration({
      wbpId: sampleWbpId1,
      visitDate: testVisitDate,
      primaryVisitor: {
        nik: '3201019999990001',
        nama: 'Pengunjung Loket 1',
        jenisKelamin: 'Laki-laki',
        relasi: 'Ayah',
        alamat: 'Purwakarta',
        telepon: '081200000001'
      },
      adultFollowers: [],
      childrenCount: 0,
      luggageItems: []
    });

    const res = await verifyArrival(reg.registrationNumber, 'petugas_loket_1', visitDayNow());

    expect(res.queueEntry.queueNumber).toBe('A 001');
    expect(res.queueEntry.sequence).toBe(1);
    expect(res.registration.status).toBe('HADIR TERVERIFIKASI');
    expect(res.registration.queueInfo?.queueNumber).toBe('A 001');

    const dailyQueue = await getDailyQueue(testVisitDate);
    expect(dailyQueue.lastNumber).toBe(1);
    expect(dailyQueue.entries.length).toBe(1);
  });

  it('TC 22: verifikasi kedua menghasilkan nomor antrean "A 002" secara urut', async () => {
    const reg1 = await createRegistration({
      wbpId: sampleWbpId1,
      visitDate: testVisitDate,
      primaryVisitor: {
        nik: '3201019999990002',
        nama: 'Pengunjung Pertama',
        jenisKelamin: 'Laki-laki',
        relasi: 'Ayah',
        alamat: 'Purwakarta',
        telepon: '081200000002'
      },
      adultFollowers: [],
      childrenCount: 0,
      luggageItems: []
    });

    const reg2 = await createRegistration({
      wbpId: sampleWbpId2,
      visitDate: testVisitDate,
      primaryVisitor: {
        nik: '3201019999990003',
        nama: 'Pengunjung Kedua',
        jenisKelamin: 'Perempuan',
        relasi: 'Ibu',
        alamat: 'Purwakarta',
        telepon: '081200000003'
      },
      adultFollowers: [],
      childrenCount: 0,
      luggageItems: []
    });

    const res1 = await verifyArrival(reg1.registrationNumber, 'petugas_1', visitDayNow());
    const res2 = await verifyArrival(reg2.registrationNumber, 'petugas_2', visitDayNow());

    expect(res1.queueEntry.queueNumber).toBe('A 001');
    expect(res2.queueEntry.queueNumber).toBe('A 002');
  });

  it('menolak verifikasi jika pendaftaran sudah pernah diverifikasi', async () => {
    const reg = await createRegistration({
      wbpId: sampleWbpId1,
      visitDate: testVisitDate,
      primaryVisitor: {
        nik: '3201019999990004',
        nama: 'Pengunjung Double',
        jenisKelamin: 'Laki-laki',
        relasi: 'Paman',
        alamat: 'Purwakarta',
        telepon: '081200000004'
      },
      adultFollowers: [],
      childrenCount: 0,
      luggageItems: []
    });

    await verifyArrival(reg.registrationNumber, 'petugas_1', visitDayNow());

    await expect(
      verifyArrival(reg.registrationNumber, 'petugas_2', visitDayNow())
    ).rejects.toThrow('tidak dapat diverifikasi');
  });

  it('menolak verifikasi sebelum tanggal kunjungan dan tidak menerbitkan antrean', async () => {
    const reg = await createRegistration({
      wbpId: sampleWbpId1,
      visitDate: testVisitDate,
      primaryVisitor: {
        nik: '3201019999990006',
        nama: 'Pengunjung Terlalu Awal',
        jenisKelamin: 'Laki-laki',
        relasi: 'Ayah',
        alamat: 'Purwakarta',
        telepon: '081200000006'
      },
      adultFollowers: [],
      childrenCount: 0,
      luggageItems: []
    });

    const dayBefore = visitDayNow().minus({ days: 1 });

    await expect(
      verifyArrival(reg.registrationNumber, 'petugas_1', dayBefore)
    ).rejects.toThrow('tanggal kunjungan');

    const dailyQueue = await getDailyQueue(testVisitDate);
    expect(dailyQueue.entries).toHaveLength(0);
    expect(dailyQueue.lastNumber).toBe(0);

    const record = await getRegistrationByNumber(reg.registrationNumber);
    expect(record?.status).toBe('MENUNGGU VERIFIKASI');
  });

  it('updateQueueStatus memperbarui status antrean dan menyinkronkan status registrasi', async () => {
    const reg = await createRegistration({
      wbpId: sampleWbpId1,
      visitDate: testVisitDate,
      primaryVisitor: {
        nik: '3201019999990005',
        nama: 'Pengunjung Status',
        jenisKelamin: 'Laki-laki',
        relasi: 'Kakak',
        alamat: 'Purwakarta',
        telepon: '081200000005'
      },
      adultFollowers: [],
      childrenCount: 0,
      luggageItems: []
    });

    const { queueEntry } = await verifyArrival(reg.registrationNumber, 'petugas_1', visitDayNow());

    // Ubah status menjadi DIPANGGIL
    const called = await updateQueueStatus(testVisitDate, queueEntry.queueNumber, 'DIPANGGIL', 'petugas_pemanggil');
    expect(called.status).toBe('DIPANGGIL');

    let syncedReg = await getRegistrationByNumber(reg.registrationNumber);
    expect(syncedReg?.status).toBe('DIPANGGIL');

    // Ubah status menjadi SEDANG BERKUNJUNG
    await updateQueueStatus(testVisitDate, queueEntry.queueNumber, 'SEDANG BERKUNJUNG', 'petugas_pintu');
    syncedReg = await getRegistrationByNumber(reg.registrationNumber);
    expect(syncedReg?.status).toBe('SEDANG BERKUNJUNG');

    // Ubah status menjadi SELESAI
    await updateQueueStatus(testVisitDate, queueEntry.queueNumber, 'SELESAI', 'petugas_pintu');
    syncedReg = await getRegistrationByNumber(reg.registrationNumber);
    expect(syncedReg?.status).toBe('SELESAI');

    // Status final tidak boleh Mundur atau melompat.
    await expect(
      updateQueueStatus(testVisitDate, queueEntry.queueNumber, 'DIPANGGIL', 'petugas_pintu')
    ).rejects.toThrow('tidak diizinkan');
  });
});
