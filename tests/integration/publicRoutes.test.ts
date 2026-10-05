import request from 'supertest';
import fs from 'fs';
import { createApp } from '../../src/app';
import { replaceWbpData } from '../../src/services/wbpService';
import { updateRegistrationStatus } from '../../src/services/registrationService';
import { STORAGE_PATHS, getRegistrationFilePath } from '../../src/storage/paths';
import { csrfTokenFrom } from '../helpers/csrf';
import { getUpcomingVisitDate } from '../helpers/visitDate';

describe('Public Flow & API Integration Tests', () => {
  const app = createApp();
  let sampleWbpId: string;
  let testVisitDate: string;

  beforeAll(async () => {
    const sampleData = [
      {
        No: 1,
        'No Reg Instansi': 'INT-REG-001',
        Nama: 'TATANG BIN TEDI',
        'Tanggal Lahir': '1978-09-21',
        'Tanggal Masuk': '2024-12-19',
        'Lokasi Sel': 'TP Umum LT 1/A.04',
        'Putus Sidang': 'Sudah',
        'Jenis WBP': 'Narapidana'
      }
    ];

    await replaceWbpData(sampleData, 'integration_test');
    const { getAllWbp } = await import('../../src/services/wbpService');
    const all = await getAllWbp(true);
    sampleWbpId = all[0]!.wbpId;

    testVisitDate = getUpcomingVisitDate('Narapidana');
  });

  beforeEach(() => {
    const regPath = getRegistrationFilePath(testVisitDate);
    if (fs.existsSync(regPath)) {
      try {
        fs.unlinkSync(regPath);
      } catch {}
    }
    if (fs.existsSync(STORAGE_PATHS.REG_LOOKUP_FILE)) {
      try {
        fs.unlinkSync(STORAGE_PATHS.REG_LOOKUP_FILE);
      } catch {}
    }
  });

  it('GET / merender beranda publik dengan tema OKLCH dan tombol toggle dark mode', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SIKUNJUNG');
    expect(res.text).toContain('Jadwal Kunjungan WBP');
    expect(res.text).toContain('theme-toggle-btn');
  });

  it('GET /daftar merender formulir pendaftaran interaktif', async () => {
    const res = await request(app).get('/daftar');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Formulir Pendaftaran Kunjungan Online');
    expect(res.text).toContain('Cari Data Warga Binaan Pemasyarakatan');
    expect(res.text).toContain('theme-toggle-btn');
  });

  it('GET /api/wbp/search?q=tatang mengembalikan hasil pencarian WBP secara cepat (< 300ms)', async () => {
    const startTime = Date.now();
    const res = await request(app).get('/api/wbp/search?q=tatang');
    const duration = Date.now() - startTime;

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].nama).toBe('TATANG BIN TEDI');
    expect(res.body[0].lokasiSel).toBeUndefined(); // Privasi terjaga
    expect(duration).toBeLessThan(300);
  });

  it('GET /api/schedule/available-dates?wbpId=... mengembalikan 4 hari kalender', async () => {
    const res = await request(app).get(`/api/schedule/available-dates?wbpId=${sampleWbpId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(4);
    expect(res.body[0]).toHaveProperty('dateStr');
    expect(res.body[0]).toHaveProperty('available');
  });

  it('menolak POST /daftar tanpa token CSRF', async () => {
    const res = await request(app).post('/daftar').send({
      wbpId: sampleWbpId,
      visitDate: testVisitDate,
      primaryNik: '3201018888880099',
      primaryNama: 'Tanpa Token',
      primaryJenisKelamin: 'Laki-laki',
      primaryRelasi: 'Paman',
      primaryTelepon: '081233445566',
      primaryAlamat: 'Purwakarta',
      childrenCount: '0'
    });

    expect(res.status).toBe(403);
  });

  it('Alur Pendaftaran Penuh: POST /daftar -> Sukses -> Unduh PDF -> Cek Status -> Pembatalan', async () => {
    const agent = request.agent(app);

    // 0. Ambil token CSRF dari halaman formulir (cookie disimpan oleh agent)
    const registerPage = await agent.get('/daftar');
    const csrfToken = csrfTokenFrom(registerPage);

    // 1. Submit pendaftaran
    const submitRes = await agent
      .post('/daftar')
      .set('x-csrf-token', csrfToken)
      .send({
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryNik: '3201018888880001',
        primaryNama: 'Bambang Sutrisno',
        primaryJenisKelamin: 'Laki-laki',
        primaryRelasi: 'Paman',
        primaryTelepon: '081233445566',
        primaryAlamat: 'Jl. Ahmad Yani No. 15 Purwakarta',
        childrenCount: '0'
      });

    expect(submitRes.status).toBe(302);
    const location = submitRes.header.location as string;
    expect(location).toContain('/daftar/sukses?reg=');

    const regMatch = location.match(/reg=([^&]+)/);
    const regNumber = decodeURIComponent(regMatch && regMatch[1] ? regMatch[1] : '');
    const tokenMatch = location.match(/token=([^&]+)/);
    const verifyToken = decodeURIComponent(tokenMatch && tokenMatch[1] ? tokenMatch[1] : '');
    expect(regNumber).toMatch(/^REG-\d{8}-[A-Z0-9]{6}$/);
    expect(verifyToken.length).toBeGreaterThan(0);

    // 2. Halaman sukses hanya bisa diakses dengan token
    const successRes = await agent.get(
      `/daftar/sukses?reg=${encodeURIComponent(regNumber)}&token=${encodeURIComponent(verifyToken)}`
    );
    expect(successRes.status).toBe(200);
    expect(successRes.text).toContain(regNumber);
    expect(successRes.text).toContain('Pendaftaran Kunjungan Berhasil');
    expect(successRes.text).toContain('Unduh bukti PDF (A6)');
    expect(successRes.text).not.toContain('PDF A4');

    const successWithoutToken = await agent.get(`/daftar/sukses?reg=${encodeURIComponent(regNumber)}`);
    expect(successWithoutToken.status).toBe(302);

    // 2b. Lookup NIK publik hanya mengembalikan data non-sensitif
    const lookupRes = await agent.get('/api/nik/lookup?nik=3201018888880001');
    expect(lookupRes.status).toBe(200);
    expect(lookupRes.body.nama).toBe('Bambang Sutrisno');
    expect(lookupRes.body.alamat).toBeUndefined();
    expect(lookupRes.body.telepon).toBeUndefined();

    // 3. Unduh Bukti PDF A6 hanya dengan token
    const pdfRes = await agent.get(
      `/daftar/pdf/${encodeURIComponent(regNumber)}?token=${encodeURIComponent(verifyToken)}`
    );
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.header['content-type']).toBe('application/pdf');
    expect(pdfRes.body.toString('utf8', 0, 5)).toBe('%PDF-');
    expect(pdfRes.body.toString('latin1')).toMatch(
      /\/MediaBox\s*\[\s*0\s+0\s+297\.64\s+419\.5[23]\s*\]/
    );

    const pdfWithoutToken = await agent.get(`/daftar/pdf/${encodeURIComponent(regNumber)}`);
    expect(pdfWithoutToken.status).toBe(404);

    // 4. Cek Status Publik wajib menyertakan NIK pendaftar utama (POST, bukan URL)
    const statusWithoutNik = await agent
      .post('/status')
      .set('x-csrf-token', csrfToken)
      .type('form')
      .send({ reg: regNumber });
    expect(statusWithoutNik.status).toBe(200);
    expect(statusWithoutNik.text).toContain('Masukkan NIK pendaftar utama');
    expect(statusWithoutNik.text).not.toContain('MENUNGGU VERIFIKASI');

    const statusLookup = await agent
      .post('/status')
      .set('x-csrf-token', csrfToken)
      .type('form')
      .send({ reg: regNumber, nik: '3201018888880001' });
    expect(statusLookup.status).toBe(302);
    expect(statusLookup.header.location).toContain('token=');

    const statusRes = await agent.get(statusLookup.header.location as string);
    expect(statusRes.status).toBe(200);
    expect(statusRes.text).toContain(regNumber);
    expect(statusRes.text).toContain('MENUNGGU VERIFIKASI');

    // 5. Pembatalan Mandiri oleh Pengunjung (BR-10)
    const cancelRes = await agent
      .post('/status/batal')
      .set('x-csrf-token', csrfToken)
      .type('form')
      .send({
        regNumber,
        nik: '3201018888880001',
        reason: 'Ada acara keluarga mendesak'
      });

    expect(cancelRes.status).toBe(302);
    expect(cancelRes.header.location).toContain('success=cancelled');
    expect(cancelRes.header.location).toContain('token=');

    // Verifikasi status pendaftaran berubah menjadi DIBATALKAN
    const statusAfterCancel = await agent.get(cancelRes.header.location as string);
    expect(statusAfterCancel.status).toBe(200);
    expect(statusAfterCancel.text).toContain('DIBATALKAN');
  });

  it('status TIDAK HADIR ditampilkan sebagai status gagal tanpa timeline kunjungan', async () => {
    const agent = request.agent(app);
    const registerPage = await agent.get('/daftar');
    const csrfToken = csrfTokenFrom(registerPage);

    const submitRes = await agent
      .post('/daftar')
      .set('x-csrf-token', csrfToken)
      .send({
        wbpId: sampleWbpId,
        visitDate: testVisitDate,
        primaryNik: '3201018888880022',
        primaryNama: 'Tidak Hadir Test',
        primaryJenisKelamin: 'Laki-laki',
        primaryRelasi: 'Saudara',
        primaryTelepon: '081233445577',
        primaryAlamat: 'Jl. Veteran No. 10 Purwakarta',
        childrenCount: '0'
      });

    expect(submitRes.status).toBe(302);
    const location = String(submitRes.header.location ?? '');
    const regNumber = decodeURIComponent((location.match(/reg=([^&]+)/) ?? [])[1] ?? '');
    const verifyToken = decodeURIComponent((location.match(/token=([^&]+)/) ?? [])[1] ?? '');

    await updateRegistrationStatus(regNumber, 'TIDAK HADIR', 'test_runner', 'Tidak hadir');

    const statusRes = await agent.get(
      `/status?reg=${encodeURIComponent(regNumber)}&token=${encodeURIComponent(verifyToken)}`
    );

    expect(statusRes.status).toBe(200);
    expect(statusRes.text).toContain('TIDAK HADIR');
    expect(statusRes.text).not.toContain('Progres status kunjungan');
  });
});
