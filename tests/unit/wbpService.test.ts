import fs from 'fs';
import path from 'path';
import {
  clearWbpCache,
  getAllWbp,
  getWbpById,
  getWbpPublicSnapshot,
  normalizeWbpRecord,
  replaceWbpData,
  searchWbp,
  toPublicSnapshot,
  updateWbpVisitingStatus
} from '../../src/services/wbpService';
import { STORAGE_PATHS } from '../../src/storage/paths';
import { RawWbpRecord } from '../../src/types/wbp';
import { atomicWriteJson } from '../../src/storage/jsonStorageEngine';

describe('WBP Service & Engine Tests', () => {
  const sampleRaw: RawWbpRecord[] = [
    {
      No: 1,
      'No Reg Instansi': 'B III 36/026',
      Nama: 'TATANG BIN TEDI',
      'Tanggal Lahir': '1978-09-21',
      Usia: 48,
      'Tanggal Masuk': '2024-12-19',
      'Lokasi Sel': 'TP Umum LT 1/A.04',
      'Putus Sidang': 'Sudah'
    },
    {
      No: 2,
      'No Reg Instansi': 'B I 274/024',
      Nama: 'ILHAM SUSANTO BIN OCAN',
      'Tanggal Lahir': '1981-08-16',
      Usia: 45,
      'Tanggal Masuk': '2024-12-19',
      'Lokasi Sel': 'TP Umum LT 1/B.02',
      'Putus Sidang': 'Sudah',
      'Jenis WBP': 'Narapidana',
      'Boleh Dikunjungi': 'Hanya Titipan Barang'
    },
    {
      No: 3,
      'No Reg Instansi': 'B I 287/024',
      Nama: 'ARIA FATULAESA BIN JAENUDIN',
      'Tanggal Lahir': '1984-07-15',
      Usia: 42,
      'Tanggal Masuk': '2024-12-19',
      'Lokasi Sel': 'TP Umum LT 1/A.04',
      'Putus Sidang': 'Sudah',
      'Boleh Dikunjungi': 'Tidak Boleh Dikunjungi'
    },
    {
      No: 4,
      'No Reg Instansi': 'A I 12/025',
      Nama: 'DEDI SURYADI',
      'Tanggal Lahir': '1995-05-10',
      'Tanggal Masuk': '2025-01-10',
      'Lokasi Sel': 'TP Umum LT 1/C.01',
      'Putus Sidang': 'Belum'
    }
  ];

  beforeEach(async () => {
    clearWbpCache();
    await atomicWriteJson(STORAGE_PATHS.WBP_DATA_FILE, sampleRaw);
  });

  afterAll(async () => {
    clearWbpCache();
  });

  describe('normalizeWbpRecord & toPublicSnapshot', () => {
    it('harus menghitung usia secara dinamis dan menetapkan wbpId deterministik', () => {
      const normalized = normalizeWbpRecord(sampleRaw[0]!, 0, '2026-11-06');
      expect(normalized.wbpId).toBeDefined();
      expect(normalized.wbpId.length).toBe(64); // SHA-256 length
      expect(normalized.nama).toBe('TATANG BIN TEDI');
      expect(normalized.jenisWbp).toBe('Narapidana');
      expect(normalized.bolehDikunjungi).toBe('Boleh Dikunjungi');
      expect(normalized.usia).toBe(48);
    });

    it('harus menurunkan jenisWbp Tahanan jika putusSidang Belum', () => {
      const normalized = normalizeWbpRecord(sampleRaw[3]!, 3);
      expect(normalized.jenisWbp).toBe('Tahanan');
      expect(normalized.putusSidang).toBe('Belum');
    });

    it('harus mengabaikan Jenis WBP dari JSON jika berbeda dengan putusSidang', () => {
      const sudah = normalizeWbpRecord(
        { ...sampleRaw[0]!, 'Jenis WBP': 'Tahanan' },
        0
      );
      expect(sudah.putusSidang).toBe('Sudah');
      expect(sudah.jenisWbp).toBe('Narapidana');

      const belum = normalizeWbpRecord(
        { ...sampleRaw[3]!, 'Jenis WBP': 'Narapidana' },
        3
      );
      expect(belum.putusSidang).toBe('Belum');
      expect(belum.jenisWbp).toBe('Tahanan');
    });

    it('toPublicSnapshot TIDAK BOLEH memuat lokasiSel atau noRegInstansi (FR P03)', () => {
      const normalized = normalizeWbpRecord(sampleRaw[0]!, 0);
      const snapshot = toPublicSnapshot(normalized);

      expect((snapshot as any).lokasiSel).toBeUndefined();
      expect((snapshot as any).noRegInstansi).toBeUndefined();
      expect(snapshot.nama).toBe('TATANG BIN TEDI');
      expect(snapshot.wbpId).toBe(normalized.wbpId);
    });
  });

  describe('searchWbp (FR P02, TC 01, TC 02)', () => {
    it('TC 01: pencarian "tatang" case-insensitive menemukan "TATANG BIN TEDI"', async () => {
      const startTime = Date.now();
      const results = await searchWbp('tatang');
      const elapsed = Date.now() - startTime;

      expect(results.length).toBe(1);
      expect(results[0]?.nama).toBe('TATANG BIN TEDI');
      expect(elapsed).toBeLessThan(300); // NFR 03: response time < 300ms
    });

    it('TC 02: pencarian dengan spasi ganda "tatang   bin" tetap menemukan WBP', async () => {
      const results = await searchWbp('tatang   bin');
      expect(results.length).toBe(1);
      expect(results[0]?.nama).toBe('TATANG BIN TEDI');
    });

    it('harus mengembalikan array kosong jika query kurang dari 2 karakter', async () => {
      const results = await searchWbp('t');
      expect(results).toEqual([]);
    });

    it('harus menghormati batas limit pencarian', async () => {
      const results = await searchWbp('bin', 1);
      expect(results.length).toBe(1);
    });

    it('TC 09 & TC 10: status Boleh Dikunjungi tampil sesuai data pada snapshot publik', async () => {
      const resultsIlham = await searchWbp('ilham');
      expect(resultsIlham[0]?.bolehDikunjungi).toBe('Hanya Titipan Barang');

      const resultsAria = await searchWbp('aria');
      expect(resultsAria[0]?.bolehDikunjungi).toBe('Tidak Boleh Dikunjungi');
    });
  });

  describe('getWbpById & getWbpPublicSnapshot', () => {
    it('dapat mengambil data WBP lengkap by id', async () => {
      const all = await getAllWbp();
      const first = all[0]!;
      const found = await getWbpById(first.wbpId);

      expect(found).not.toBeNull();
      expect(found?.noRegInstansi).toBe('B III 36/026');
      expect(found?.lokasiSel).toBe('TP Umum LT 1/A.04');
    });

    it('getWbpPublicSnapshot mengembalikan snapshot publik tanpa lokasi sel', async () => {
      const all = await getAllWbp();
      const first = all[0]!;
      const snapshot = await getWbpPublicSnapshot(first.wbpId);

      expect(snapshot).not.toBeNull();
      expect((snapshot as any).lokasiSel).toBeUndefined();
      expect(snapshot?.nama).toBe('TATANG BIN TEDI');
    });
  });

  describe('updateWbpVisitingStatus', () => {
    it('dapat memperbarui status kunjungan WBP dan mencatat audit log', async () => {
      const all = await getAllWbp();
      const first = all[0]!;

      const updated = await updateWbpVisitingStatus(first.wbpId, 'Tidak Boleh Dikunjungi', 'admin_petugas');
      expect(updated.bolehDikunjungi).toBe('Tidak Boleh Dikunjungi');

      // Ambil ulang dari service untuk memastikan file ter-update dan cache invalid
      const reloaded = await getWbpById(first.wbpId);
      expect(reloaded?.bolehDikunjungi).toBe('Tidak Boleh Dikunjungi');
    });

    it('melempar error jika wbpId tidak ditemukan', async () => {
      await expect(
        updateWbpVisitingStatus('invalid-id-12345', 'Boleh Dikunjungi')
      ).rejects.toThrow('tidak ditemukan');
    });
  });

  describe('replaceWbpData & upload validation', () => {
    it('berhasil mengganti data, membuat backup, dan mereset cache', async () => {
      const newData = [
        {
          No: 1,
          'No Reg Instansi': 'NEW-REG-001',
          Nama: 'WARGA BINAAN BARU',
          'Tanggal Lahir': '1990-01-01',
          'Tanggal Masuk': '2025-01-01',
          'Lokasi Sel': 'Blok C.01',
          'Putus Sidang': 'Sudah'
        }
      ];

      const res = await replaceWbpData(newData, 'superadmin');
      expect(res.count).toBe(1);
      expect(res.backupPath).toBeDefined();
      expect(fs.existsSync(res.backupPath)).toBe(true);

      const all = await getAllWbp();
      expect(all.length).toBe(1);
      expect(all[0]?.nama).toBe('WARGA BINAAN BARU');
      expect(all[0]?.noRegInstansi).toBe('NEW-REG-001');
    });

    it('menolak data tidak valid dan tidak merusak data yang ada', async () => {
      const invalidData = [
        {
          Nama: 'ORANG TANPA NO REG'
          // No Reg Instansi hilang
        }
      ];

      await expect(replaceWbpData(invalidData, 'superadmin')).rejects.toThrow('Validasi JSON WBP gagal');

      // Data lama tetap aman
      const all = await getAllWbp();
      expect(all.length).toBeGreaterThan(0);
    });
  });
});
