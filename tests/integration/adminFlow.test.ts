import request from 'supertest';
import fs from 'fs';
import { Settings } from 'luxon';
import { createApp } from '../../src/app';
import { bootstrapSystem } from '../../src/bootstrap/seedData';
import { replaceWbpData, updateWbpVisitingStatus } from '../../src/services/wbpService';
import {
  createDefaultDailyRegistration,
  createRegistration,
  getRegistrationByNumber
} from '../../src/services/registrationService';
import { getDailyQueue } from '../../src/services/queueService';
import { getPendingResets } from '../../src/services/adminService';
import { atomicWriteJson } from '../../src/storage/jsonStorageEngine';
import { STORAGE_PATHS, getQueueFilePath, getRegistrationFilePath } from '../../src/storage/paths';
import { RegistrationRecord } from '../../src/types/registration';
import { parseDateJakarta } from '../../src/utils/dateUtils';
import { csrfTokenFrom } from '../helpers/csrf';
import { getUpcomingVisitDate } from '../helpers/visitDate';

describe('Admin Authentication & Operations Integration Tests', () => {
  const app = createApp();
  const masterPassword = process.env.ADMIN_MASTER_INITIAL_PASSWORD!;
  const realNow = Settings.now;
  let sampleWbpId: string;
  let testVisitDate: string;
  let upcomingVisitDate: string;
  let fixedVisitMillis: number;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    // Pastikan akun master bersih dan siap dengan password awal
    if (fs.existsSync(STORAGE_PATHS.ADMINS_FILE)) {
      try {
        fs.unlinkSync(STORAGE_PATHS.ADMINS_FILE);
      } catch {}
    }
    await bootstrapSystem();

    const sampleData = [
      {
        No: 1,
        'No Reg Instansi': 'ADM-REG-001',
        Nama: 'TATANG BIN TEDI',
        'Tanggal Lahir': '1978-09-21',
        'Tanggal Masuk': '2024-12-19',
        'Lokasi Sel': 'TP Umum LT 1/A.04',
        'Putus Sidang': 'Sudah',
        'Jenis WBP': 'Narapidana'
      }
    ];

    await replaceWbpData(sampleData, 'admin_test');
    const { getAllWbp } = await import('../../src/services/wbpService');
    const all = await getAllWbp(true);
    sampleWbpId = all[0]!.wbpId;

    testVisitDate = getUpcomingVisitDate('Narapidana');
    upcomingVisitDate = parseDateJakarta(testVisitDate)
      .plus({ days: 1 })
      .toFormat('yyyy-MM-dd');
    fixedVisitMillis = parseDateJakarta(testVisitDate).set({
      hour: 9,
      minute: 0,
      second: 0,
      millisecond: 0
    }).toMillis();
  });

  beforeEach(() => {
    Settings.now = () => fixedVisitMillis;
    agent = request.agent(app);
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
    const upcomingPath = getRegistrationFilePath(upcomingVisitDate);
    if (fs.existsSync(upcomingPath)) {
      try {
        fs.unlinkSync(upcomingPath);
      } catch {}
    }
    if (fs.existsSync(STORAGE_PATHS.REG_LOOKUP_FILE)) {
      try {
        fs.unlinkSync(STORAGE_PATHS.REG_LOOKUP_FILE);
      } catch {}
    }
  });

  afterEach(() => {
    Settings.now = realNow;
  });

  it('GET /admin/login merender halaman login dengan toggle dark mode', async () => {
    const res = await request(app).get('/admin/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Portal Petugas Lapas');
    expect(res.text).toContain('theme-toggle-btn');
  });

  it('mengakses /admin/dashboard tanpa login diarahkan ke /admin/login', async () => {
    const res = await request(app).get('/admin/dashboard');
    expect(res.status).toBe(302);
    expect(res.header.location).toBe('/admin/login');
  });

  it('login gagal dengan password salah menampilkan pesan error', async () => {
    const loginPage = await agent.get('/admin/login');
    const csrfToken = csrfTokenFrom(loginPage);
    const res = await agent
      .post('/admin/login')
      .set('x-csrf-token', csrfToken)
      .send({ username: 'master', password: 'WrongPassword123!' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Username atau password tidak sesuai');
  });

  it('menolak POST tanpa token CSRF', async () => {
    const res = await request(app)
      .post('/admin/login')
      .send({ username: 'master', password: masterPassword });

    expect(res.status).toBe(403);
  });

  it('logout hanya tersedia melalui POST dengan token CSRF', async () => {
    const getLogout = await request(app).get('/admin/logout');
    expect(getLogout.status).toBe(404);

    const postLogout = await request(app).post('/admin/logout').send({});
    expect(postLogout.status).toBe(403);
  });

  it('menolak login dengan password melebihi batas panjang', async () => {
    const loginPage = await agent.get('/admin/login');
    const csrfToken = csrfTokenFrom(loginPage);
    const res = await agent
      .post('/admin/login')
      .set('x-csrf-token', csrfToken)
      .send({ username: 'master', password: `${'A'.repeat(130)}a1!` });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Username atau password tidak sesuai');
  });

  it('lupa password tidak membocorkan username terdaftar atau tidak', async () => {
    const resetAgent = request.agent(app);
    const forgotPage = await resetAgent.get('/admin/lupa-password');
    const csrfToken = csrfTokenFrom(forgotPage);

    const res = await resetAgent
      .post('/admin/lupa-password')
      .set('x-csrf-token', csrfToken)
      .send({ username: 'username_tidak_ada_xyz' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Jika username tersebut terdaftar');
    expect(res.text).not.toContain('tidak terdaftar sebagai petugas');
  });

  it('Alur Penuh Admin: Login -> Dashboard -> Verifikasi Loket -> Cetak Tiket A6 -> Antrean -> Logout', async () => {
    // 1. Login dengan Master Account (initial password dari .env)
    const loginPage = await agent.get('/admin/login');
    const loginCsrf = csrfTokenFrom(loginPage);
    const loginRes = await agent
      .post('/admin/login')
      .set('x-csrf-token', loginCsrf)
      .send({ username: 'master', password: masterPassword });

    expect(loginRes.status).toBe(302);
    expect(loginRes.header.location).toContain('/admin/ganti-password');

    // 1b. Wajib ganti password saat login pertama (FR A14)
    const changePage = await agent.get('/admin/ganti-password');
    const csrfToken = csrfTokenFrom(changePage);
    const newPassword = 'TestMasterPassword456!';
    const changePassRes = await agent
      .post('/admin/ganti-password')
      .set('x-csrf-token', csrfToken)
      .send({
        newPassword,
        confirmPassword: newPassword
      });

    expect(changePassRes.status).toBe(302);
    expect(changePassRes.header.location).toContain('/admin/dashboard');

    // 2. Siapkan booking H+1 agar dashboard harus menampilkannya walau
    // tanggal pantauan utama adalah hari ini.
    const upcomingDaily = createDefaultDailyRegistration(upcomingVisitDate);
    upcomingDaily.records.push({
      id: 'admin-flow-upcoming',
      registrationNumber: 'REG-ADMINFLOW-UPCOMING',
      verifyToken: 'test-token',
      createdAt: fixedVisitMillis ? new Date(fixedVisitMillis).toISOString() : new Date().toISOString(),
      visitDate: upcomingVisitDate,
      status: 'MENUNGGU VERIFIKASI',
      wbp: {
        wbpId: sampleWbpId,
        nama: 'TATANG BIN TEDI',
        jenisWbp: 'Narapidana'
      },
      primaryVisitor: {
        nik: '3201017777770099',
        nama: 'Keluarga Booking Mendatang',
        jenisKelamin: 'Perempuan',
        relasi: 'Kakak',
        alamat: 'Purwakarta',
        telepon: '081234567899'
      },
      adultFollowers: [],
      childrenCount: 0,
      totalAdults: 1,
      totalVisitors: 1,
      luggageItems: [],
      statusHistory: []
    } as unknown as RegistrationRecord);
    upcomingDaily.guard.capacityUsed.registrations = 1;
    upcomingDaily.guard.capacityUsed.visitors = 1;
    await atomicWriteJson(getRegistrationFilePath(upcomingVisitDate), upcomingDaily);

    // 3. Akses Dashboard
    const dashRes = await agent.get('/admin/dashboard');
    expect(dashRes.status).toBe(200);
    expect(dashRes.text).toContain('Dashboard Operasional Lapas');
    expect(dashRes.text).toContain('master (MASTER)');
    expect(dashRes.text).toContain('Booking mendatang');
    expect(dashRes.text).toContain('Pending semua tanggal');
    expect(dashRes.text).toContain('Pendaftaran mendatang (H+1 s/d H+3)');
    expect(dashRes.text).toContain(upcomingVisitDate);
    expect(dashRes.text).toContain('1 menunggu');
    expect(dashRes.text).toContain('Penggunaan kuota harian');

    // 3. Buat Pendaftaran Sampel
    const reg = await createRegistration({
      wbpId: sampleWbpId,
      visitDate: testVisitDate,
      primaryVisitor: {
        nik: '3201017777770001',
        nama: 'Keluarga Tatang',
        jenisKelamin: 'Laki-laki',
        relasi: 'Adik',
        telepon: '081234567890',
        alamat: 'Purwakarta'
      },
      adultFollowers: [],
      childrenCount: 0,
      luggageItems: []
    });

    // 4. Verifikasi Kedatangan Fisik di Loket Petugas
    const checkRes = await agent.get(`/admin/verifikasi?reg=${reg.registrationNumber}`);
    expect(checkRes.status).toBe(200);
    expect(checkRes.text).toContain(reg.registrationNumber);
    expect(checkRes.text).toContain('TATANG BIN TEDI');
    expect(checkRes.text).toContain('title="TP Umum LT 1/A.04"');
    expect(checkRes.text).toContain('</i> A.04</span>'); // Kamar sel disingkat untuk petugas

    // Eksekusi verifikasi kedatangan
    const verifyPostRes = await agent
      .post('/admin/verifikasi')
      .set('x-csrf-token', csrfToken)
      .send({ regNumber: reg.registrationNumber });

    expect(verifyPostRes.status).toBe(302);
    expect(verifyPostRes.header.location).toContain('queue=A%20001');
    expect(verifyPostRes.header.location).toContain(`date=${testVisitDate}`);

    // 4b. Tautan pasca-verifikasi harus tetap membawa tanggal kunjungan.
    const successPage = await agent.get(verifyPostRes.header.location!);
    expect(successPage.status).toBe(200);
    expect(successPage.text).toContain(`href="/admin/antrean?date=${testVisitDate}"`);
    expect(successPage.text).toContain(`href="/admin/pendaftaran?date=${testVisitDate}"`);
    expect(successPage.text).toContain(`href="/admin/verifikasi?date=${testVisitDate}"`);

    const registrationListRes = await agent.get(`/admin/pendaftaran?date=${testVisitDate}`);
    expect(registrationListRes.status).toBe(200);
    expect(registrationListRes.text).toContain('Daftar Registrasi Kunjungan');
    expect(registrationListRes.text).not.toContain('Daftar Seluruh Pendaftaran');
    expect(registrationListRes.text).toContain('title="TP Umum LT 1/A.04"');
    expect(registrationListRes.text).toContain('</i> A.04</span>');

    const wbpPageRes = await agent.get('/admin/wbp');
    expect(wbpPageRes.status).toBe(200);
    expect(wbpPageRes.text).toContain('Kamar Sel');
    expect(wbpPageRes.text).toContain('Status WBP');
    expect(wbpPageRes.text).toContain('</i> A.04');

    // 5. Cetak Tiket Pengawasan Petugas A6
    const ticketRes = await agent.get(`/admin/tiket/A%20001?date=${testVisitDate}`);
    expect(ticketRes.status).toBe(200);
    expect(ticketRes.header['content-type']).toBe('application/pdf');
    expect(ticketRes.body.toString('utf8', 0, 5)).toBe('%PDF-');
    expect(ticketRes.body.toString('latin1')).toMatch(
      /\/MediaBox\s*\[\s*0\s+0\s+297\.64\s+419\.5[23]\s*\]/
    );

    // 6. Kelola Antrean (Ubah Status ke DIPANGGIL)
    const queueStatusRes = await agent
      .post('/admin/antrean/status')
      .set('x-csrf-token', csrfToken)
      .send({
        date: testVisitDate,
        queueNumber: 'A 001',
        status: 'DIPANGGIL'
      });

    expect(queueStatusRes.status).toBe(302);

    // 7. Kelola WBP (Ubah Status Kunjungan)
    const wbpStatusRes = await agent
      .post('/admin/wbp/status')
      .set('x-csrf-token', csrfToken)
      .send({
        wbpId: sampleWbpId,
        status: 'Hanya Titipan Barang'
      });

    expect(wbpStatusRes.status).toBe(302);

    // 8. Akses Halaman Laporan, Audit Log, dan Kelola Admin Master
    const reportsRes = await agent.get(`/admin/laporan?date=${testVisitDate}`);
    expect(reportsRes.status).toBe(200);
    expect(reportsRes.text).toContain('Laporan Rekapitulasi Kunjungan');
    expect(reportsRes.text).toContain('Kamar Sel');
    expect(reportsRes.text).toContain('title="TP Umum LT 1/A.04"');
    expect(reportsRes.text).toContain('>A.04</span>');

    const csvRes = await agent.get(`/admin/laporan/csv?date=${testVisitDate}`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain('"Status WBP"');
    expect(csvRes.text).toContain('"Kamar Sel"');
    expect(csvRes.text).toContain('"A.04"');
    expect(csvRes.text).not.toContain('"TP Umum LT 1/A.04"');

    const auditRes = await agent.get('/admin/audit');
    expect(auditRes.status).toBe(200);
    expect(auditRes.text).toContain('Catatan Audit Jejak Rekam');

    const masterRes = await agent.get('/admin/kelola-admin');
    expect(masterRes.status).toBe(200);
    expect(masterRes.text).toContain('Manajemen Akun Petugas');

    // 9. Logout (POST + CSRF)
    const logoutRes = await agent
      .post('/admin/logout')
      .set('x-csrf-token', csrfTokenFrom(masterRes));
    expect(logoutRes.status).toBe(302);
    expect(logoutRes.header.location).toBe('/admin/login');
  });

  it('menolak verifikasi untuk tanggal kunjungan lain dan menyembunyikan tombol verifikasi', async () => {
    const loginPage = await agent.get('/admin/login');
    const loginCsrf = csrfTokenFrom(loginPage);
    const loginRes = await agent
      .post('/admin/login')
      .set('x-csrf-token', loginCsrf)
      .send({ username: 'master', password: 'TestMasterPassword456!' });

    expect(loginRes.status).toBe(302);
    expect(loginRes.header.location).toBe('/admin/dashboard');

    // Alur sebelumnya mengubah status WBP menjadi titipan barang. Kembalikan
    // agar pengujian verifikasi tanggal ini tetap bisa membuat pendaftaran.
    await updateWbpVisitingStatus(sampleWbpId, 'Boleh Dikunjungi', 'test_rejection');

    // Simulasikan admin membuka loket satu hari sebelum tanggal kunjungan.
    const dayBeforeMillis = parseDateJakarta(testVisitDate)
      .minus({ days: 1 })
      .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
      .toMillis();
    Settings.now = () => dayBeforeMillis;

    const reg = await createRegistration({
      wbpId: sampleWbpId,
      visitDate: testVisitDate,
      primaryVisitor: {
        nik: '3201017777770002',
        nama: 'Keluarga Terlalu Awal',
        jenisKelamin: 'Perempuan',
        relasi: 'Kakak',
        telepon: '081234567891',
        alamat: 'Purwakarta'
      },
      adultFollowers: [],
      childrenCount: 0,
      luggageItems: []
    });

    const checkRes = await agent.get(`/admin/verifikasi?reg=${reg.registrationNumber}`);
    expect(checkRes.status).toBe(200);
    expect(checkRes.text).toContain('Verifikasi hanya dapat dilakukan pada tanggal kunjungan');
    expect(checkRes.text).toContain('Verifikasi tersedia pada tanggal kunjungan');
    expect(checkRes.text).not.toContain('KTP sesuai');

    const verifyPostRes = await agent
      .post('/admin/verifikasi')
      .set('x-csrf-token', csrfTokenFrom(checkRes))
      .send({ regNumber: reg.registrationNumber });

    expect(verifyPostRes.status).toBe(200);
    expect(verifyPostRes.text).toContain('tanggal kunjungan');

    const record = await getRegistrationByNumber(reg.registrationNumber);
    expect(record?.status).toBe('MENUNGGU VERIFIKASI');

    const queue = await getDailyQueue(testVisitDate);
    expect(queue.entries).toHaveLength(0);
    expect(queue.lastNumber).toBe(0);
  });

  it('reset password mencabut sesi lama dan tidak menaruh password sementara di URL', async () => {
    const masterAgent = request.agent(app);

    const masterLoginPage = await masterAgent.get('/admin/login');
    const masterLoginCsrf = csrfTokenFrom(masterLoginPage);
    const masterLoginRes = await masterAgent
      .post('/admin/login')
      .set('x-csrf-token', masterLoginCsrf)
      .send({ username: 'master', password: 'TestMasterPassword456!' });

    expect(masterLoginRes.status).toBe(302);
    expect(masterLoginRes.header.location).toBe('/admin/dashboard');

    const managePage = await masterAgent.get('/admin/kelola-admin');
    const manageCsrf = csrfTokenFrom(managePage);
    const createAdminRes = await masterAgent
      .post('/admin/kelola-admin/create')
      .set('x-csrf-token', manageCsrf)
      .send({
        username: 'session_test',
        role: 'ADMIN',
        password: 'TestAdminPassword123!'
      });

    expect(createAdminRes.status).toBe(302);

    const targetAgent = request.agent(app);
    const targetLoginPage = await targetAgent.get('/admin/login');
    const targetLoginCsrf = csrfTokenFrom(targetLoginPage);
    const targetLoginRes = await targetAgent
      .post('/admin/login')
      .set('x-csrf-token', targetLoginCsrf)
      .send({ username: 'session_test', password: 'TestAdminPassword123!' });

    expect(targetLoginRes.status).toBe(302);
    expect(targetLoginRes.header.location).toBe('/admin/dashboard');
    expect((await targetAgent.get('/admin/dashboard')).status).toBe(200);

    const resetAgent = request.agent(app);
    const forgotPage = await resetAgent.get('/admin/lupa-password');
    const forgotCsrf = csrfTokenFrom(forgotPage);
    const forgotRes = await resetAgent
      .post('/admin/lupa-password')
      .set('x-csrf-token', forgotCsrf)
      .send({ username: 'session_test' });

    expect(forgotRes.status).toBe(200);

    const pendingReset = (await getPendingResets()).find(
      (reset) => reset.username === 'session_test' && reset.status === 'PENDING'
    );
    expect(pendingReset).toBeDefined();

    const managePageBeforeApprove = await masterAgent.get('/admin/kelola-admin');
    const approveCsrf = csrfTokenFrom(managePageBeforeApprove);
    const approveRes = await masterAgent
      .post('/admin/kelola-admin/approve-reset')
      .set('x-csrf-token', approveCsrf)
      .send({ resetId: pendingReset!.id });

    expect(approveRes.status).toBe(302);
    expect(approveRes.header.location).toBe('/admin/kelola-admin');
    expect(approveRes.header.location).not.toContain('tempPassword');

    const tempPasswordPage = await masterAgent.get('/admin/kelola-admin');
    expect(tempPasswordPage.text).toContain('Password sementara berhasil dibuat');
    expect(tempPasswordPage.text).toContain('session_test');

    const refreshedPage = await masterAgent.get('/admin/kelola-admin');
    expect(refreshedPage.text).not.toContain('Password sementara berhasil dibuat');

    // Sesi admin lama harus langsung dicabut setelah reset password oleh Master.
    const revokedSession = await targetAgent.get('/admin/dashboard');
    expect(revokedSession.status).toBe(302);
    expect(revokedSession.header.location).toBe('/admin/login');

    // Route ganti password juga tidak boleh bisa dipakai sesi yang sudah dicabut.
    const revokedChangePassword = await targetAgent.get('/admin/ganti-password');
    expect(revokedChangePassword.status).toBe(302);
    expect(revokedChangePassword.header.location).toBe('/admin/login');
  });

  afterAll(async () => {
    // Pastikan akun master bersih dan siap dengan password awal
    if (fs.existsSync(STORAGE_PATHS.ADMINS_FILE)) {
      try {
        fs.unlinkSync(STORAGE_PATHS.ADMINS_FILE);
      } catch {}
    }
    await bootstrapSystem();
  });
});
