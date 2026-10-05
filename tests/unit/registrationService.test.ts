import fs from 'fs';
import {
  cancelRegistration,
  createRegistration,
  getDailyRegistration,
  getRegistrationByNumber,
  updateRegistrationStatus
} from '../../src/services/registrationService';
import { clearWbpCache, replaceWbpData, updateWbpVisitingStatus } from '../../src/services/wbpService';
import { clearSettingsCache } from '../../src/services/settingsService';
import { getVisitorHistoryByNik } from '../../src/services/nikHistoryService';
import { STORAGE_PATHS, getRegistrationFilePath } from '../../src/storage/paths';
import { CreateRegistrationInputSchema } from '../../src/validators/registrationSchema';
import { getUpcomingVisitDate } from '../helpers/visitDate';

describe('Registration Service & Guard Tests', () => {
  let sampleWbpId: string;
  let testVisitDate: string;

  const sampleData = [
    {
      No: 1,
      'No Reg Instansi': 'TEST-REG-001',
      Nama: 'TATANG BIN TEDI',
      'Tanggal Lahir': '1978-09-21',
      'Tanggal Masuk': '2024-12-19',
      'Lokasi Sel': 'Blok A.04',
      'Putus Sidang': 'Sudah',
      'Jenis WBP': 'Narapidana'
    },
    {
      No: 2,
      'No Reg Instansi': 'TEST-REG-002',
      Nama: 'BUDI DUA',
      'Tanggal Lahir': '1985-05-15',
      'Tanggal Masuk': '2024-12-19',
      'Lokasi Sel': 'Blok B.01',
      'Putus Sidang': 'Sudah',
      'Jenis WBP': 'Narapidana'
    }
  ];

  beforeAll(async () => {
    testVisitDate = getUpcomingVisitDate('Narapidana');
  });

  beforeEach(async () => {
    clearSettingsCache();
    clearWbpCache();
    await replaceWbpData(sampleData, 'system_test');
    const { getAllWbp } = await import('../../src/services/wbpService');
    const all = await getAllWbp(true);
    sampleWbpId = all[0]!.wbpId;

    // Bersihkan file registrasi tanggal tes jika ada
    const regPath = getRegistrationFilePath(testVisitDate);
    if (fs.existsSync(regPath)) {
      try {
        fs.unlinkSync(regPath);
      } catch {}
    }
    // Bersihkan file indeks agar tes bersifat idempotent
    if (fs.existsSync(STORAGE_PATHS.NIK_HISTORY_FILE)) {
      try {
        fs.unlinkSync(STORAGE_PATHS.NIK_HISTORY_FILE);
      } catch {}
    }
    if (fs.existsSync(STORAGE_PATHS.REG_LOOKUP_FILE)) {
      try {
        fs.unlinkSync(STORAGE_PATHS.REG_LOOKUP_FILE);
      } catch {}
    }
  });

  describe('Quota Composition Validation (BR-04, TC 11 - TC 14)', () => {
    it('TC 11: 4 dewasa tanpa anak (1 utama + 3 pengikut, 0 anak) -> lolos schema', () => {
      const input = {
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011111110001',
          nama: 'Budi Utama',
          jenisKelamin: 'Laki-laki',
          relasi: 'Kakak',
          alamat: 'Jl. Merdeka No. 1',
          telepon: '081234567890'
        },
        adultFollowers: [
          {
            nik: '3201011111110002',
            nama: 'Pengikut Satu',
            jenisKelamin: 'Perempuan',
            relasi: 'Adik',
            alamat: 'Jl. Merdeka No. 1'
          },
          {
            nik: '3201011111110003',
            nama: 'Pengikut Dua',
            jenisKelamin: 'Laki-laki',
            relasi: 'Paman',
            alamat: 'Jl. Merdeka No. 1'
          },
          {
            nik: '3201011111110004',
            nama: 'Pengikut Tiga',
            jenisKelamin: 'Perempuan',
            relasi: 'Bibi',
            alamat: 'Jl. Merdeka No. 1'
          }
        ],
        childrenCount: 0,
        luggageItems: []
      };

      const parsed = CreateRegistrationInputSchema.safeParse(input);
      expect(parsed.success).toBe(true);
    });

    it('TC 12: 5 dewasa tanpa anak (1 utama + 4 pengikut, 0 anak) -> ditolak schema', () => {
      const input = {
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011111110001',
          nama: 'Budi Utama',
          jenisKelamin: 'Laki-laki',
          relasi: 'Kakak',
          alamat: 'Jl. Merdeka No. 1',
          telepon: '081234567890'
        },
        adultFollowers: [
          { nik: '3201011111110002', nama: 'P1', jenisKelamin: 'Laki-laki', relasi: 'Adik', alamat: 'Jl. 1' },
          { nik: '3201011111110003', nama: 'P2', jenisKelamin: 'Laki-laki', relasi: 'Adik', alamat: 'Jl. 1' },
          { nik: '3201011111110004', nama: 'P3', jenisKelamin: 'Laki-laki', relasi: 'Adik', alamat: 'Jl. 1' },
          { nik: '3201011111110005', nama: 'P4', jenisKelamin: 'Laki-laki', relasi: 'Adik', alamat: 'Jl. 1' }
        ],
        childrenCount: 0,
        luggageItems: []
      };

      const parsed = CreateRegistrationInputSchema.safeParse(input);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toContain('maksimal pengunjung dewasa tanpa anak adalah 4 orang');
    });

    it('TC 13: 3 dewasa dan 2 anak (1 utama + 2 pengikut, 2 anak) -> lolos schema', () => {
      const input = {
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011111110001',
          nama: 'Budi Utama',
          jenisKelamin: 'Laki-laki',
          relasi: 'Kakak',
          alamat: 'Jl. Merdeka No. 1',
          telepon: '081234567890'
        },
        adultFollowers: [
          { nik: '3201011111110002', nama: 'P1', jenisKelamin: 'Perempuan', relasi: 'Istri', alamat: 'Jl. 1' },
          { nik: '3201011111110003', nama: 'P2', jenisKelamin: 'Perempuan', relasi: 'Ibu', alamat: 'Jl. 1' }
        ],
        childrenCount: 2,
        luggageItems: []
      };

      const parsed = CreateRegistrationInputSchema.safeParse(input);
      expect(parsed.success).toBe(true);
    });

    it('TC 14: 4 dewasa dan 1 anak (1 utama + 3 pengikut, 1 anak) -> ditolak schema', () => {
      const input = {
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011111110001',
          nama: 'Budi Utama',
          jenisKelamin: 'Laki-laki',
          relasi: 'Kakak',
          alamat: 'Jl. Merdeka No. 1',
          telepon: '081234567890'
        },
        adultFollowers: [
          { nik: '3201011111110002', nama: 'P1', jenisKelamin: 'Laki-laki', relasi: 'Adik', alamat: 'Jl. 1' },
          { nik: '3201011111110003', nama: 'P2', jenisKelamin: 'Laki-laki', relasi: 'Adik', alamat: 'Jl. 1' },
          { nik: '3201011111110004', nama: 'P3', jenisKelamin: 'Laki-laki', relasi: 'Adik', alamat: 'Jl. 1' }
        ],
        childrenCount: 1,
        luggageItems: []
      };

      const parsed = CreateRegistrationInputSchema.safeParse(input);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toContain('batas maksimal dewasa adalah 3 orang');
    });

    it('menolak NIK duplikat di dalam rombongan pengunjung yang sama', () => {
      const input = {
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011111110001',
          nama: 'Budi Utama',
          jenisKelamin: 'Laki-laki',
          relasi: 'Kakak',
          alamat: 'Jl. Merdeka No. 1',
          telepon: '081234567890'
        },
        adultFollowers: [
          { nik: '3201011111110001', nama: 'Budi Kembar', jenisKelamin: 'Laki-laki', relasi: 'Adik', alamat: 'Jl. 1' }
        ],
        childrenCount: 0,
        luggageItems: []
      };

      const parsed = CreateRegistrationInputSchema.safeParse(input);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toContain('duplikat');
    });
  });

  describe('createRegistration, Guards & Capacity Enforcement (BR-05, BR-06, BR-07)', () => {
    it('berhasil membuat pendaftaran, mengupdate file harian, dan mencatat riwayat NIK', async () => {
      const reg = await createRegistration({
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011234560001',
          nama: 'Ahmad Pengunjung',
          jenisKelamin: 'Laki-laki',
          relasi: 'Saudara Kandung',
          alamat: 'Kp. Munjul Purwakarta',
          telepon: '081298765432'
        },
        adultFollowers: [],
        childrenCount: 0,
        luggageItems: [
          { itemId: 'ITM 001', itemName: 'Makanan', quantity: 2, unit: 'Bungkus' }
        ]
      });

      expect(reg.registrationNumber).toMatch(/^REG-\d{8}-[A-Z0-9]{6}$/);
      expect(reg.status).toBe('MENUNGGU VERIFIKASI');
      expect(reg.totalAdults).toBe(1);
      expect(reg.totalVisitors).toBe(1);

      // Verifikasi file registrasi harian
      const daily = await getDailyRegistration(testVisitDate);
      expect(daily.guard.activeWbp).toContain(sampleWbpId);
      expect(daily.guard.activeNiks).toContain('3201011234560001');
      expect(daily.guard.capacityUsed.registrations).toBe(1);
      expect(daily.guard.capacityUsed.visitors).toBe(1);

      // Verifikasi indeks riwayat NIK
      const history = await getVisitorHistoryByNik('3201011234560001');
      expect(history).not.toBeNull();
      expect(history?.nama).toBe('Ahmad Pengunjung');
      expect(history?.totalVisits).toBe(1);
    });

    it('TC 15: menolak pendaftaran kedua untuk WBP yang sama di tanggal yang sama', async () => {
      // Pendaftaran 1
      await createRegistration({
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011234560002',
          nama: 'Visitor Satu',
          jenisKelamin: 'Laki-laki',
          relasi: 'Kakak',
          alamat: 'Purwakarta',
          telepon: '081234567890'
        },
        adultFollowers: [],
        childrenCount: 0,
        luggageItems: []
      });

      // Pendaftaran 2 untuk WBP yang sama
      await expect(
        createRegistration({
          wbpId: sampleWbpId,
          visitDate: testVisitDate,
          primaryVisitor: {
            nik: '3201011234560003',
            nama: 'Visitor Dua',
            jenisKelamin: 'Perempuan',
            relasi: 'Ibu',
            alamat: 'Purwakarta',
            telepon: '081234567891'
          },
          adultFollowers: [],
          childrenCount: 0,
          luggageItems: []
        })
      ).rejects.toThrow('sudah terdaftar untuk kunjungan');
    });

    it('TC 16: menolak NIK yang sama mendaftar lebih dari sekali pada tanggal yang sama', async () => {
      const { getAllWbp } = await import('../../src/services/wbpService');
      const all = await getAllWbp();
      const secondWbpId = all[1]!.wbpId;

      // Pendaftaran untuk WBP 1 dengan NIK A
      await createRegistration({
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011234560004',
          nama: 'Pengunjung A',
          jenisKelamin: 'Laki-laki',
          relasi: 'Teman',
          alamat: 'Purwakarta',
          telepon: '081234567890'
        },
        adultFollowers: [],
        childrenCount: 0,
        luggageItems: []
      });

      // Pendaftaran untuk WBP 2 dengan NIK A yang sama
      await expect(
        createRegistration({
          wbpId: secondWbpId,
          visitDate: testVisitDate,
          primaryVisitor: {
            nik: '3201011234560004',
            nama: 'Pengunjung A',
            jenisKelamin: 'Laki-laki',
            relasi: 'Teman',
            alamat: 'Purwakarta',
            telepon: '081234567890'
          },
          adultFollowers: [],
          childrenCount: 0,
          luggageItems: []
        })
      ).rejects.toThrow('sudah terdaftar dalam kunjungan aktif');
    });

    it('TC 18: menolak barang titipan yang melebihi batas maksimal kategori (Uang > 200rb)', async () => {
      await expect(
        createRegistration({
          wbpId: sampleWbpId,
          visitDate: testVisitDate,
          primaryVisitor: {
            nik: '3201011234560005',
            nama: 'Visitor Uang',
            jenisKelamin: 'Laki-laki',
            relasi: 'Ayah',
            alamat: 'Purwakarta',
            telepon: '081234567890'
          },
          adultFollowers: [],
          childrenCount: 0,
          luggageItems: [
            { itemId: 'ITM 004', itemName: 'Uang Titipan', quantity: 250000, unit: 'Rupiah' }
          ]
        })
      ).rejects.toThrow('melebihi batas maksimal');
    });

    it('TC 10: menolak pendaftaran kunjungan untuk WBP Hanya Titipan Barang', async () => {
      await updateWbpVisitingStatus(sampleWbpId, 'Hanya Titipan Barang', 'test_runner');

      await expect(
        createRegistration({
          wbpId: sampleWbpId,
          visitDate: testVisitDate,
          primaryVisitor: {
            nik: '3201011234560010',
            nama: 'Visitor Titipan',
            jenisKelamin: 'Perempuan',
            relasi: 'Ibu',
            alamat: 'Purwakarta',
            telepon: '081234567890'
          },
          adultFollowers: [],
          childrenCount: 0,
          luggageItems: [
            { itemId: 'ITM 001', itemName: 'Makanan', quantity: 1, unit: 'Bungkus' }
          ]
        })
      ).rejects.toThrow('hanya dapat menerima titipan barang');
    });
  });

  describe('cancelRegistration & Quota Release (BR-10, TC 19, TC 20)', () => {
    it('TC 19: pembatalan dengan NIK cocok membebaskan kuota WBP dan NIK', async () => {
      const reg = await createRegistration({
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011234560006',
          nama: 'Pendaftar Batal',
          jenisKelamin: 'Laki-laki',
          relasi: 'Kakak',
          alamat: 'Purwakarta',
          telepon: '081234567890'
        },
        adultFollowers: [],
        childrenCount: 0,
        luggageItems: []
      });

      // Batalkan
      const cancelled = await cancelRegistration(
        reg.registrationNumber,
        '3201011234560006',
        'Berhalangan hadir'
      );
      expect(cancelled.status).toBe('DIBATALKAN');

      // Pastikan kuota di guard terbebaskan
      const daily = await getDailyRegistration(testVisitDate);
      expect(daily.guard.activeWbp).not.toContain(sampleWbpId);
      expect(daily.guard.activeNiks).not.toContain('3201011234560006');
      expect(daily.guard.capacityUsed.registrations).toBe(0);

      // Sekarang WBP yang sama dapat didaftarkan kembali!
      const reRegistered = await createRegistration({
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011234560007',
          nama: 'Pendaftar Pengganti',
          jenisKelamin: 'Perempuan',
          relasi: 'Ibu',
          alamat: 'Purwakarta',
          telepon: '081234567891'
        },
        adultFollowers: [],
        childrenCount: 0,
        luggageItems: []
      });

      expect(reRegistered.status).toBe('MENUNGGU VERIFIKASI');
    });

    it('TC 20: pembatalan dengan NIK tidak cocok ditolak', async () => {
      const reg = await createRegistration({
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011234560008',
          nama: 'Pendaftar Asli',
          jenisKelamin: 'Laki-laki',
          relasi: 'Adik',
          alamat: 'Purwakarta',
          telepon: '081234567890'
        },
        adultFollowers: [],
        childrenCount: 0,
        luggageItems: []
      });

      await expect(
        cancelRegistration(reg.registrationNumber, '3201019999999999')
      ).rejects.toThrow('NIK pendaftar utama tidak cocok');
    });

    it('getRegistrationByNumber mengembalikan data pendaftaran via lookup index', async () => {
      const reg = await createRegistration({
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011234560009',
          nama: 'Pendaftar Lookup',
          jenisKelamin: 'Perempuan',
          relasi: 'Ibu',
          alamat: 'Purwakarta',
          telepon: '081234567890'
        },
        adultFollowers: [],
        childrenCount: 0,
        luggageItems: []
      });

      const found = await getRegistrationByNumber(reg.registrationNumber);
      expect(found).not.toBeNull();
      expect(found?.primaryVisitor.nama).toBe('Pendaftar Lookup');
    });
  });

  describe('Admin Status Transition & Idempotent Quota Release (BR-07, BR-12)', () => {
    it('status TIDAK HADIR membebaskan kuota tepat satu kali dan transisi final ditolak', async () => {
      const reg = await createRegistration({
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryVisitor: {
          nik: '3201011234560011',
          nama: 'Pendaftar Tidak Hadir',
          jenisKelamin: 'Laki-laki',
          relasi: 'Kakak',
          alamat: 'Purwakarta',
          telepon: '081234567890'
        },
        adultFollowers: [],
        childrenCount: 0,
        luggageItems: []
      });

      await updateRegistrationStatus(
        reg.registrationNumber,
        'TIDAK HADIR',
        'Sistem (Otomatis 14:30 WIB)',
        'Tidak hadir sampai jam tutup layanan'
      );

      const afterRelease = await getDailyRegistration(testVisitDate);
      expect(afterRelease.guard.activeWbp).not.toContain(sampleWbpId);
      expect(afterRelease.guard.activeNiks).not.toContain('3201011234560011');
      expect(afterRelease.guard.capacityUsed.registrations).toBe(0);
      expect(afterRelease.guard.capacityUsed.visitors).toBe(0);

      // Status final tidak boleh diubah lagi sehingga kuota tidak terpotong dua kali.
      await expect(
        updateRegistrationStatus(reg.registrationNumber, 'DIBATALKAN', 'admin_test')
      ).rejects.toThrow('tidak diizinkan');

      const afterRejectedTransition = await getDailyRegistration(testVisitDate);
      expect(afterRejectedTransition.guard.capacityUsed.registrations).toBe(0);
      expect(afterRejectedTransition.guard.capacityUsed.visitors).toBe(0);
      expect(afterRejectedTransition.records.find((r) => r.id === reg.id)?.status).toBe('TIDAK HADIR');
    });

    it('menolak nilai status pendaftaran yang tidak dikenal', async () => {
      await expect(
        updateRegistrationStatus('REG-20260101-ABCDEF', 'STATUS_PALSU' as any, 'admin_test')
      ).rejects.toThrow('tidak valid');
    });
  });
});
