import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { STORAGE_PATHS } from '../storage/paths';
import { getDailyRegistration, getRegistrationByNumber, updateRegistrationStatus } from '../services/registrationService';
import { getRegistrationOverview } from '../services/registrationOverviewService';
import { getDailyQueue, updateQueueStatus, verifyArrival } from '../services/queueService';
import { getLuggageCategories, getSettings, updateLuggageCategories, updateSettings } from '../services/settingsService';
import { getAllWbp, replaceWbpData, updateWbpVisitingStatus } from '../services/wbpService';
import { approvePasswordReset, createAdmin, deleteAdmin, getAllAdmins, getPendingResets, rejectPasswordReset } from '../services/adminService';
import { generateSupervisorTicketA6 } from '../services/pdfService';
import { createDailyBackup, listBackups, restoreFromZip } from '../services/backupService';
import { getNowInJakarta } from '../utils/dateUtils';
import { formatCellLocation } from '../utils/formatCellLocation';
import { AuditLogEntry, logger } from '../utils/logger';
import {
  AdminSettingsInputSchema,
  LuggageCategoryInputSchema,
  QueueStatusSchema,
  RegistrationStatusSchema,
  WbpVisitingStatusSchema,
  firstZodError,
  parseAdminDate
} from '../validators/adminActionSchema';

export async function renderDashboard(req: Request, res: Response): Promise<void> {
  const todayStr = getNowInJakarta().toFormat('yyyy-MM-dd');
  const selectedDate = parseAdminDate(req.query.date, todayStr);

  const [dailyReg, dailyQueue, settings, registrationOverview] = await Promise.all([
    getDailyRegistration(selectedDate),
    getDailyQueue(selectedDate),
    getSettings(),
    getRegistrationOverview(getNowInJakarta())
  ]);

  const totalRegistrations = dailyReg.records.length;
  const waitingVerification = dailyReg.records.filter((r) => r.status === 'MENUNGGU VERIFIKASI').length;
  const verifiedCount = dailyReg.records.filter((r) => r.status === 'HADIR TERVERIFIKASI').length;
  const callingCount = dailyReg.records.filter((r) => r.status === 'DIPANGGIL' || r.status === 'SEDANG BERKUNJUNG').length;
  const completedCount = dailyReg.records.filter((r) => r.status === 'SELESAI').length;
  const cancelledCount = dailyReg.records.filter((r) => r.status === 'DIBATALKAN' || r.status === 'DITOLAK').length;

  const maxRegs = settings.maxDailyRegistrations || 40;
  const maxVisitors = settings.maxDailyVisitors || 60;
  const remainingRegQuota = Math.max(0, maxRegs - dailyReg.guard.capacityUsed.registrations);
  const remainingVisitorQuota = Math.max(0, maxVisitors - dailyReg.guard.capacityUsed.visitors);

  res.render('admin/dashboard', {
    adminUser: req.session.adminUser,
    selectedDate,
    todayStr,
    totalRegistrations,
    waitingVerification,
    verifiedCount,
    callingCount,
    completedCount,
    cancelledCount,
    remainingRegQuota,
    remainingVisitorQuota,
    capacityUsed: dailyReg.guard.capacityUsed,
    settings,
    dailyQueue,
    registrationOverview
  });
}

export async function renderVerificationPage(req: Request, res: Response): Promise<void> {
  const queryReg = typeof req.query.reg === 'string' ? req.query.reg.trim() : '';
  const successQueue = typeof req.query.queue === 'string' ? req.query.queue : null;
  const todayStr = getNowInJakarta().toFormat('yyyy-MM-dd');
  const rawSuccessDate = typeof req.query.date === 'string' ? req.query.date : null;
  const successDate = rawSuccessDate ? parseAdminDate(rawSuccessDate, todayStr) : null;

  let record = null;
  let error = null;

  if (queryReg) {
    record = await getRegistrationByNumber(queryReg);
    if (!record) {
      error = `Pendaftaran "${queryReg}" tidak ditemukan.`;
    }
  }

  res.render('admin/verification', {
    adminUser: req.session.adminUser,
    todayStr,
    verificationDate: successDate ?? record?.visitDate ?? todayStr,
    queryReg,
    record,
    error,
    successQueue,
    successDate
  });
}

export async function handleVerifyArrival(req: Request, res: Response): Promise<void> {
  const regNumber = typeof req.body.regNumber === 'string' ? req.body.regNumber.trim() : '';
  const adminUsername = req.session.adminUser?.username || 'petugas_loket';

  try {
    const resArrival = await verifyArrival(regNumber, adminUsername);
    res.redirect(
      `/admin/verifikasi?success=1&reg=${encodeURIComponent(regNumber)}&queue=${encodeURIComponent(
        resArrival.queueEntry.queueNumber
      )}&date=${encodeURIComponent(resArrival.registration.visitDate)}`
    );
  } catch (err: any) {
    const todayStr = getNowInJakarta().toFormat('yyyy-MM-dd');
    const record = await getRegistrationByNumber(regNumber);
    res.render('admin/verification', {
      adminUser: req.session.adminUser,
      todayStr,
      verificationDate: record?.visitDate ?? todayStr,
      queryReg: regNumber,
      record,
      error: err.message || 'Gagal memverifikasi pendaftaran.',
      successQueue: null,
      successDate: null
    });
  }
}

export async function renderPrintTicket(req: Request, res: Response): Promise<void> {
  const queueNumber = req.params.queueNumber?.trim() ?? '';
  const dateStr = parseAdminDate(req.query.date, getNowInJakarta().toFormat('yyyy-MM-dd'));

  const dailyQueue = await getDailyQueue(dateStr);
  const queueEntry = dailyQueue.entries.find((e) => e.queueNumber === queueNumber);

  if (!queueEntry) {
    res.status(404).send('Data antrean tidak ditemukan.');
    return;
  }

  const record = await getRegistrationByNumber(queueEntry.regNumber);
  if (!record) {
    res.status(404).send('Data registrasi untuk antrean ini tidak ditemukan.');
    return;
  }

  const settings = await getSettings();
  const pdfBuffer = await generateSupervisorTicketA6(record, queueNumber, queueEntry.sequence, settings);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Tiket_${queueNumber}.pdf"`);
  res.send(pdfBuffer);
}

export async function renderQueuePage(req: Request, res: Response): Promise<void> {
  const todayStr = getNowInJakarta().toFormat('yyyy-MM-dd');
  const selectedDate = parseAdminDate(req.query.date, todayStr);

  const dailyQueue = await getDailyQueue(selectedDate);

  res.render('admin/queue', {
    adminUser: req.session.adminUser,
    selectedDate,
    todayStr,
    dailyQueue
  });
}

export async function handleUpdateQueueStatus(req: Request, res: Response): Promise<void> {
  const todayStr = getNowInJakarta().toFormat('yyyy-MM-dd');
  const dateStr = parseAdminDate(req.body.date, todayStr);
  const queueNumber = typeof req.body.queueNumber === 'string' ? req.body.queueNumber.trim() : '';
  const parsedStatus = QueueStatusSchema.safeParse(req.body.status);
  const adminUsername = req.session.adminUser?.username || 'petugas';

  if (!queueNumber || !parsedStatus.success) {
    logger.warn({ queueNumber, status: req.body.status }, 'Status antrean tidak valid');
    res.redirect(`/admin/antrean?date=${encodeURIComponent(dateStr)}`);
    return;
  }

  try {
    await updateQueueStatus(dateStr, queueNumber, parsedStatus.data, adminUsername);
  } catch (err) {
    logger.error({ err, queueNumber }, 'Gagal mengupdate status antrean');
  }

  res.redirect(`/admin/antrean?date=${encodeURIComponent(dateStr)}`);
}

export async function renderRegistrationsList(req: Request, res: Response): Promise<void> {
  const todayStr = getNowInJakarta().toFormat('yyyy-MM-dd');
  const selectedDate = parseAdminDate(req.query.date, todayStr);
  const parsedStatusFilter = RegistrationStatusSchema.safeParse(req.query.status);
  const statusFilter = parsedStatusFilter.success ? parsedStatusFilter.data : '';

  const dailyReg = await getDailyRegistration(selectedDate);
  let records = dailyReg.records;

  if (statusFilter) {
    records = records.filter((r) => r.status === statusFilter);
  }

  res.render('admin/registrations', {
    adminUser: req.session.adminUser,
    selectedDate,
    todayStr,
    statusFilter,
    records,
    error: req.query.error === 'invalid_status'
      ? 'Status atau data yang dikirim tidak valid.'
      : req.query.error === 'status_update_failed'
        ? 'Status pendaftaran gagal diubah. Periksa kembali data dan alur statusnya.'
        : null
  });
}

export async function handleUpdateRegistrationStatus(req: Request, res: Response): Promise<void> {
  const todayStr = getNowInJakarta().toFormat('yyyy-MM-dd');
  const dateStr = parseAdminDate(req.body.date, todayStr);
  const regNumber = typeof req.body.regNumber === 'string' ? req.body.regNumber.trim() : '';
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  const parsedStatus = RegistrationStatusSchema.safeParse(req.body.newStatus);
  const adminUsername = req.session.adminUser?.username || 'admin';

  if (!regNumber || !parsedStatus.success) {
    logger.warn({ regNumber, status: req.body.newStatus }, 'Perubahan status pendaftaran tidak valid');
    res.redirect(`/admin/pendaftaran?date=${encodeURIComponent(dateStr)}&error=invalid_status`);
    return;
  }

  try {
    await updateRegistrationStatus(regNumber, parsedStatus.data, adminUsername, reason);
  } catch (err) {
    logger.error({ err, regNumber }, 'Gagal mengupdate status pendaftaran');
    res.redirect(`/admin/pendaftaran?date=${encodeURIComponent(dateStr)}&error=status_update_failed`);
    return;
  }

  res.redirect(`/admin/pendaftaran?date=${encodeURIComponent(dateStr)}`);
}

export async function renderWbpManagement(req: Request, res: Response): Promise<void> {
  const wbpList = await getAllWbp(true);
  const success = req.query.success;
  const count = req.query.count;

  res.render('admin/wbp', {
    adminUser: req.session.adminUser,
    wbpList,
    success,
    count,
    error: null
  });
}

export async function handleUpdateWbpStatus(req: Request, res: Response): Promise<void> {
  const wbpId = typeof req.body.wbpId === 'string' ? req.body.wbpId.trim() : '';
  const parsedStatus = WbpVisitingStatusSchema.safeParse(req.body.status);
  const adminUsername = req.session.adminUser?.username || 'admin';

  if (!wbpId || !parsedStatus.success) {
    logger.warn({ wbpId, status: req.body.status }, 'Status kunjungan WBP tidak valid');
    res.redirect('/admin/wbp');
    return;
  }

  try {
    await updateWbpVisitingStatus(wbpId, parsedStatus.data, adminUsername);
  } catch (err) {
    logger.error({ err, wbpId }, 'Gagal update status WBP');
  }

  res.redirect('/admin/wbp');
}

export async function handleWbpUpload(req: Request, res: Response): Promise<void> {
  const file = req.file;
  const adminUsername = req.session.adminUser?.username || 'admin';

  if (!file) {
    const wbpList = await getAllWbp();
    res.render('admin/wbp', {
      adminUser: req.session.adminUser,
      wbpList,
      success: null,
      count: null,
      error: 'File JSON belum dipilih.'
    });
    return;
  }

  try {
    const content = file.buffer.toString('utf8');
    const parsed = JSON.parse(content);

    const result = await replaceWbpData(parsed, adminUsername);
    res.redirect(`/admin/wbp?success=uploaded&count=${result.count}`);
  } catch (err: any) {
    logger.warn({ err }, 'Gagal upload JSON WBP');
    const wbpList = await getAllWbp();
    res.render('admin/wbp', {
      adminUser: req.session.adminUser,
      wbpList,
      success: null,
      count: null,
      error: err.message || 'Gagal memproses file upload JSON WBP.'
    });
  }
}

export async function renderLuggageCrud(req: Request, res: Response): Promise<void> {
  const categories = await getLuggageCategories(true);
  res.render('admin/luggage', {
    adminUser: req.session.adminUser,
    categories
  });
}

export async function handleSaveLuggageCategory(req: Request, res: Response): Promise<void> {
  const adminUsername = req.session.adminUser?.username || 'admin';
  const categories = await getLuggageCategories(true);

  const action = typeof req.body.action === 'string' ? req.body.action : '';
  const id = typeof req.body.id === 'string' ? req.body.id.trim() : '';

  if (action === 'toggle') {
    const target = categories.find((c) => c.id === id);
    if (!target) {
      logger.warn({ id }, 'Kategori barang yang akan diubah tidak ditemukan');
      res.redirect('/admin/barang');
      return;
    }
    target.active = !target.active;
  } else if (action === 'create') {
    const parsed = LuggageCategoryInputSchema.safeParse({
      name: req.body.name,
      unit: req.body.unit,
      maxQuantity: req.body.maxQuantity,
      isCurrency: req.body.isCurrency === 'true'
    });

    if (!parsed.success) {
      logger.warn({ error: firstZodError(parsed.error) }, 'Kategori barang baru tidak valid');
      res.redirect('/admin/barang');
      return;
    }

    const maxSequence = categories.reduce((max, category) => {
      const match = /^ITM-(\d{3,})$/.exec(category.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    const newId = `ITM-${(maxSequence + 1).toString().padStart(3, '0')}`;

    categories.push({
      id: newId,
      name: parsed.data.name,
      unit: parsed.data.unit,
      maxQuantity: parsed.data.maxQuantity,
      isCurrency: parsed.data.isCurrency,
      active: true
    });
  } else {
    logger.warn({ action }, 'Aksi kategori barang tidak dikenal');
    res.redirect('/admin/barang');
    return;
  }

  await updateLuggageCategories(categories, adminUsername);
  res.redirect('/admin/barang');
}

export async function renderSettings(req: Request, res: Response): Promise<void> {
  const settings = await getSettings(true);
  const success = req.query.success === 'saved';

  res.render('admin/settings', {
    adminUser: req.session.adminUser,
    settings,
    success,
    error: null
  });
}

export async function handleSaveSettings(req: Request, res: Response): Promise<void> {
  const adminUsername = req.session.adminUser?.username || 'admin';

  let closedDates: string[] = [];
  if (req.body.closedSpecialDates) {
    closedDates = String(req.body.closedSpecialDates)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
  }
  closedDates = Array.from(new Set(closedDates)).sort();

  const parsed = AdminSettingsInputSchema.safeParse({
    agencyName: req.body.agencyName,
    regionalOffice: req.body.regionalOffice,
    ministry: req.body.ministry,
    address: req.body.address,
    phone: req.body.phone,
    maxDailyRegistrations: req.body.maxDailyRegistrations,
    maxDailyVisitors: req.body.maxDailyVisitors,
    ticketCustomNotes: req.body.ticketCustomNotes,
    proofCustomNotes: req.body.proofCustomNotes,
    closedSpecialDates: closedDates
  });

  if (!parsed.success) {
    logger.warn({ error: firstZodError(parsed.error) }, 'Pengaturan sistem tidak valid');
    const settings = await getSettings(true);
    res.status(400).render('admin/settings', {
      adminUser: req.session.adminUser,
      settings,
      success: false,
      error: firstZodError(parsed.error)
    });
    return;
  }

  await updateSettings(parsed.data, adminUsername);
  res.redirect('/admin/pengaturan?success=saved');
}

export async function renderReports(req: Request, res: Response): Promise<void> {
  const todayStr = getNowInJakarta().toFormat('yyyy-MM-dd');
  const selectedDate = parseAdminDate(req.query.date, todayStr);

  const [dailyReg, dailyQueue] = await Promise.all([
    getDailyRegistration(selectedDate),
    getDailyQueue(selectedDate)
  ]);

  res.render('admin/reports', {
    adminUser: req.session.adminUser,
    selectedDate,
    todayStr,
    records: dailyReg.records,
    queueEntries: dailyQueue.entries
  });
}

export async function handleExportReportCsv(req: Request, res: Response): Promise<void> {
  const dateStr = parseAdminDate(req.query.date, getNowInJakarta().toFormat('yyyy-MM-dd'));
  const dailyReg = await getDailyRegistration(dateStr);

  const headers = [
    'No Registrasi',
    'Tanggal Kunjungan',
    'Status',
    'Nama WBP',
    'Status WBP',
    'Kamar Sel',
    'Pendaftar Utama',
    'NIK Pendaftar',
    'No Telepon',
    'Total Dewasa',
    'Jumlah Anak',
    'Total Pengunjung',
    'Nomor Antrean',
    'Waktu Buat'
  ];

  // Lindungi dari CSV formula injection: sel yang diawali karakter formula
  // diberi prefix apostrof sebelum di-quote.
  const escapeCsv = (value: unknown) => {
    const str = String(value ?? '');
    const safe = /^[\s]*[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    return `"${safe.replace(/"/g, '""')}"`;
  };

  const rows = dailyReg.records.map((r) => [
    escapeCsv(r.registrationNumber),
    escapeCsv(r.visitDate),
    escapeCsv(r.status),
    escapeCsv(r.wbp.nama),
    escapeCsv(r.wbp.jenisWbp),
    escapeCsv(formatCellLocation(r.wbp.lokasiSel)),
    escapeCsv(r.primaryVisitor.nama),
    escapeCsv(r.primaryVisitor.nik),
    escapeCsv(r.primaryVisitor.telepon),
    escapeCsv(r.totalAdults),
    escapeCsv(r.childrenCount),
    escapeCsv(r.totalVisitors),
    escapeCsv(r.queueInfo?.queueNumber || '-'),
    escapeCsv(r.createdAt)
  ]);

  const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map((row) => row.join(','))].join('\r\n');

  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="Laporan_Kunjungan_${dateStr}.csv"`);
  res.send(csvContent);
}

export async function renderAuditLogs(req: Request, res: Response): Promise<void> {
  const currentMonth = getNowInJakarta().toFormat('yyyy-MM');
  const selectedMonth =
    typeof req.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)
      ? req.query.month
      : currentMonth;
  const actorFilter = typeof req.query.actor === 'string' ? req.query.actor.trim().slice(0, 64) : '';
  const actionFilter =
    typeof req.query.action === 'string' ? req.query.action.trim().slice(0, 64) : '';
  const requestedPage = Number.parseInt(String(req.query.page ?? '1'), 10);
  const pageSize = 100;

  const logFilePath = path.join(STORAGE_PATHS.LOGS_DIR, `audit_${selectedMonth}.log`);
  const rawLogs: AuditLogEntry[] = [];

  if (fs.existsSync(logFilePath)) {
    try {
      const content = await fs.promises.readFile(logFilePath, 'utf8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          rawLogs.push(JSON.parse(line) as AuditLogEntry);
        } catch {
          // Satu baris korup tidak boleh membuat seluruh audit viewer gagal.
          logger.warn({ selectedMonth }, 'Baris audit log tidak valid dilewati');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Gagal membaca audit log');
    }
  }

  // Terbaru di atas.
  rawLogs.reverse();

  const availableActions = Array.from(
    new Set(rawLogs.map((entry) => entry.action).filter(Boolean))
  ).sort();

  const normalizedActor = actorFilter.toLowerCase();
  const normalizedAction = actionFilter.toLowerCase();
  const filteredLogs = rawLogs.filter((entry) => {
    const actorMatch =
      !normalizedActor || String(entry.actor ?? '').toLowerCase().includes(normalizedActor);
    const actionMatch =
      !normalizedAction || String(entry.action ?? '').toLowerCase() === normalizedAction;
    return actorMatch && actionMatch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const currentPage = Math.min(
    Math.max(Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1, 1),
    totalPages
  );
  const pageLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  res.set('Cache-Control', 'no-store, private');
  res.render('admin/auditLogs', {
    adminUser: req.session.adminUser,
    selectedMonth,
    logs: pageLogs,
    totalLogs: filteredLogs.length,
    availableActions,
    actorFilter,
    actionFilter,
    currentPage,
    totalPages,
    pageSize
  });
}

// --- MASTER ONLY: KELOLA ADMIN & APPROVE RESET ---

export async function renderAdminManagement(req: Request, res: Response): Promise<void> {
  const [admins, pendingResets] = await Promise.all([getAllAdmins(), getPendingResets()]);

  // Password sementara disimpan satu kali di sesi, bukan di query string,
  // agar tidak masuk browser history/referrer/log akses.
  const flash = req.session.flashTempPassword ?? null;
  if (flash) {
    delete req.session.flashTempPassword;
  }

  res.set('Cache-Control', 'no-store, private');
  res.render('admin/manageAdmins', {
    adminUser: req.session.adminUser,
    admins,
    pendingResets: pendingResets.filter((r) => r.status === 'PENDING'),
    approvedTempPassword: flash?.password ?? null,
    targetUsername: flash?.username ?? null,
    error: null
  });
}

export async function handleCreateAdmin(req: Request, res: Response): Promise<void> {
  const username = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const role = req.body.role;
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const adminUsername = req.session.adminUser?.username || 'master';

  const usernameValid = /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username);
  const roleValid = role === 'MASTER' || role === 'ADMIN';

  if (!usernameValid || !roleValid) {
    const [admins, pendingResets] = await Promise.all([getAllAdmins(), getPendingResets()]);
    res.status(400).render('admin/manageAdmins', {
      adminUser: req.session.adminUser,
      admins,
      pendingResets: pendingResets.filter((r) => r.status === 'PENDING'),
      approvedTempPassword: null,
      targetUsername: null,
      error: 'Username harus 3-32 karakter (huruf kecil, angka, titik, garis bawah, atau strip) dan peran harus valid.'
    });
    return;
  }

  try {
    await createAdmin({ username, role, plainPassword: password }, adminUsername);
    res.redirect('/admin/kelola-admin');
  } catch (err: any) {
    const [admins, pendingResets] = await Promise.all([getAllAdmins(), getPendingResets()]);
    res.render('admin/manageAdmins', {
      adminUser: req.session.adminUser,
      admins,
      pendingResets: pendingResets.filter((r) => r.status === 'PENDING'),
      approvedTempPassword: null,
      targetUsername: null,
      error: err.message || 'Gagal membuat admin baru.'
    });
  }
}

export async function handleDeleteAdmin(req: Request, res: Response): Promise<void> {
  const adminId = req.body.adminId;
  const adminUsername = req.session.adminUser?.username || 'master';

  try {
    await deleteAdmin(adminId, adminUsername);
  } catch (err) {
    logger.error({ err }, 'Gagal menghapus admin');
  }

  res.redirect('/admin/kelola-admin');
}

export async function handleApproveReset(req: Request, res: Response): Promise<void> {
  const resetId = req.body.resetId;
  const adminUsername = req.session.adminUser?.username || 'master';

  try {
    const result = await approvePasswordReset(resetId, adminUsername);
    req.session.flashTempPassword = {
      username: result.admin.username,
      password: result.tempPassword
    };
    res.redirect('/admin/kelola-admin');
  } catch (err) {
    logger.error({ err }, 'Gagal approve reset password');
    res.redirect('/admin/kelola-admin');
  }
}

export async function handleRejectReset(req: Request, res: Response): Promise<void> {
  const resetId = req.body.resetId;
  const adminUsername = req.session.adminUser?.username || 'master';

  try {
    await rejectPasswordReset(resetId, adminUsername);
  } catch (err) {
    logger.error({ err }, 'Gagal reject reset password');
  }

  res.redirect('/admin/kelola-admin');
}

// --- BACKUP & RESTORE (FR A12, BR-15) ---

export async function renderBackupPage(req: Request, res: Response): Promise<void> {
  const backups = await listBackups();
  let success = null;
  if (req.query.success === 'backup_created') {
    success = 'Berkas cadangan (backup) manual berhasil dibuat dan diarsipkan.';
  } else if (req.query.success === 'restored') {
    success = 'Sistem telah berhasil dipulihkan (restore) dari file ZIP backup!';
  }

  res.render('admin/backup', {
    adminUser: req.session.adminUser,
    backups,
    success,
    error: null
  });
}

export async function handleCreateManualBackup(req: Request, res: Response): Promise<void> {
  const adminUsername = req.session.adminUser?.username || 'admin';
  try {
    await createDailyBackup('manual', adminUsername);
    res.redirect('/admin/backup?success=backup_created');
  } catch (err: any) {
    logger.error({ err }, 'Gagal membuat backup manual');
    const backups = await listBackups();
    res.render('admin/backup', {
      adminUser: req.session.adminUser,
      backups,
      success: null,
      error: err.message || 'Gagal membuat backup manual.'
    });
  }
}

export async function handleDownloadBackup(req: Request, res: Response): Promise<void> {
  const fileName = req.params.filename;
  const type = req.query.type === 'manual' ? 'manual' : 'auto';

  // Path traversal guard
  if (!fileName || path.basename(fileName) !== fileName || !fileName.endsWith('.zip')) {
    res.status(400).send('Nama file backup tidak valid.');
    return;
  }

  const baseDir = type === 'manual' ? STORAGE_PATHS.MANUAL_BACKUPS_DIR : STORAGE_PATHS.AUTO_BACKUPS_DIR;
  const fullPath = path.join(baseDir, fileName);

  if (!fs.existsSync(fullPath)) {
    res.status(404).send('File backup tidak ditemukan.');
    return;
  }

  res.download(fullPath, fileName);
}

export async function handleRestoreBackup(req: Request, res: Response): Promise<void> {
  const file = req.file;
  const adminUsername = req.session.adminUser?.username || 'admin';

  if (!file) {
    const backups = await listBackups();
    res.render('admin/backup', {
      adminUser: req.session.adminUser,
      backups,
      success: null,
      error: 'File ZIP belum dipilih.'
    });
    return;
  }

  const tempZipPath = path.join(STORAGE_PATHS.ROOT, `restore_temp_${crypto.randomUUID()}.zip`);
  try {
    await fs.promises.writeFile(tempZipPath, file.buffer);
    await restoreFromZip(tempZipPath, adminUsername);
    await fs.promises.unlink(tempZipPath);
    res.redirect('/admin/backup?success=restored');
  } catch (err: any) {
    logger.error({ err }, 'Gagal melakukan restore');
    if (fs.existsSync(tempZipPath)) {
      try { await fs.promises.unlink(tempZipPath); } catch {}
    }
    const backups = await listBackups();
    res.render('admin/backup', {
      adminUser: req.session.adminUser,
      backups,
      success: null,
      error: err.message || 'Gagal melakukan pemulihan (restore) sistem.'
    });
  }
}

