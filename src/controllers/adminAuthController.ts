import { Request, Response } from 'express';
import {
  getAdminByUsername,
  requestPasswordReset,
  updateAdminPassword,
  updateLastLogin,
  validatePasswordPolicy,
  verifyDummyPassword,
  verifyPassword
} from '../services/adminService';
import { APP_CONFIG } from '../config/appConfig';
import { logger, writeAuditLog } from '../utils/logger';

export async function renderLogin(req: Request, res: Response): Promise<void> {
  if (req.session?.adminUser) {
    res.redirect('/admin/dashboard');
    return;
  }
  res.render('admin/login', { error: null });
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    res.render('admin/login', { error: 'Username dan password wajib diisi.' });
    return;
  }

  if (
    username.length > 64 ||
    password.length > APP_CONFIG.PASSWORD_POLICY.maxLength
  ) {
    writeAuditLog({
      action: 'LOGIN_FAILED',
      actor: username.slice(0, 64),
      details: { reason: 'Input melebihi batas panjang' }
    });
    res.render('admin/login', { error: 'Username atau password tidak sesuai.' });
    return;
  }

  const admin = await getAdminByUsername(username);
  if (!admin) {
    // Tetap jalankan verifikasi Argon2 dummy agar timing respons mirip.
    await verifyDummyPassword(password);
    writeAuditLog({
      action: 'LOGIN_FAILED',
      actor: username,
      details: { reason: 'Username tidak ditemukan' }
    });
    res.render('admin/login', { error: 'Username atau password tidak sesuai.' });
    return;
  }

  const isValid = await verifyPassword(admin.passwordHash, password);
  if (!isValid) {
    writeAuditLog({
      action: 'LOGIN_FAILED',
      actor: username,
      details: { reason: 'Password salah' }
    });
    res.render('admin/login', { error: 'Username atau password tidak sesuai.' });
    return;
  }

  // Session regeneration untuk mitigasi session fixation
  req.session.regenerate(async (err) => {
    if (err) {
      logger.error({ err }, 'Gagal regenerate session');
      res.render('admin/login', { error: 'Terjadi kesalahan sistem saat otentikasi.' });
      return;
    }

    req.session.adminUser = {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      mustChangePassword: admin.mustChangePassword,
      sessionVersion: admin.sessionVersion ?? 0
    };

    await updateLastLogin(admin.id);

    writeAuditLog({
      action: 'LOGIN_SUCCESS',
      actor: admin.username,
      details: { role: admin.role }
    });

    if (admin.mustChangePassword) {
      res.redirect('/admin/ganti-password?notice=must_change');
      return;
    }

    res.redirect('/admin/dashboard');
  });
}

export function handleLogout(req: Request, res: Response): void {
  const username = req.session?.adminUser?.username ?? 'system';

  writeAuditLog({
    action: 'LOGOUT',
    actor: username
  });

  req.session.destroy((err) => {
    if (err) {
      logger.warn({ err }, 'Peringatan saat logout');
    }
    res.redirect('/admin/login');
  });
}

export function renderForgotPassword(_req: Request, res: Response): Promise<void> {
  res.render('admin/forgotPassword', { error: null, success: null });
  return Promise.resolve();
}

export async function handleForgotPassword(req: Request, res: Response): Promise<void> {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';

  try {
    if (!username || username.length > 64) {
      throw new Error('Input username tidak valid.');
    }
    await requestPasswordReset(username);
  } catch (err) {
    // Jangan bocorkan apakah username terdaftar atau tidak. Detail error
    // tetap dicatat untuk operasional, respons pengguna selalu generik.
    logger.warn({ err, username }, 'Permintaan reset password tidak diproses');
  }

  res.render('admin/forgotPassword', {
    error: null,
    success:
      'Jika username tersebut terdaftar, permintaan reset password telah diteruskan ke Dashboard Master. Silakan hubungi Administrator Master Lapas.'
  });
}

export function renderChangePassword(req: Request, res: Response): Promise<void> {
  const notice = req.query.notice === 'must_change' ? 'Anda wajib memperbarui password sementara Anda sebelum melanjutkan.' : null;
  res.render('admin/changePassword', { error: null, notice });
  return Promise.resolve();
}

export async function handleChangePassword(req: Request, res: Response): Promise<void> {
  const adminUser = req.session?.adminUser;
  if (!adminUser) {
    res.redirect('/admin/login');
    return;
  }

  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

  if (newPassword !== confirmPassword) {
    res.render('admin/changePassword', {
      error: 'Konfirmasi password baru tidak cocok.',
      notice: null
    });
    return;
  }

  const check = validatePasswordPolicy(newPassword);
  if (!check.valid) {
    res.render('admin/changePassword', {
      error: check.reason,
      notice: null
    });
    return;
  }

  try {
    const sessionVersion = await updateAdminPassword(adminUser.id, newPassword, adminUser.username);
    adminUser.mustChangePassword = false;
    adminUser.sessionVersion = sessionVersion;
    res.redirect('/admin/dashboard?notice=password_updated');
  } catch (err: any) {
    res.render('admin/changePassword', {
      error: err.message || 'Gagal mengubah password.',
      notice: null
    });
  }
}
