import { Request, Response, NextFunction } from 'express';
import { getAdminByUsername } from '../services/adminService';
import { logger } from '../utils/logger';

function respondUnauthenticated(req: Request, res: Response): void {
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    res.status(401).json({ error: 'Sesi telah berakhir. Silakan login kembali.' });
    return;
  }
  res.redirect('/admin/login');
}

function destroySession(req: Request): void {
  if (!req.session) return;
  req.session.destroy((err) => {
    if (err) {
      logger.warn({ err }, 'Gagal menghapus sesi yang tidak valid');
    }
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionUser = req.session?.adminUser;
  if (!sessionUser) {
    respondUnauthenticated(req, res);
    return;
  }

  try {
    // Verifikasi ulang ke sumber data agar sesi otomatis tidak berlaku saat
    // akun dihapus, role berubah, atau password direset oleh Master.
    const admin = await getAdminByUsername(sessionUser.username);

    if (
      !admin ||
      admin.id !== sessionUser.id ||
      (admin.sessionVersion ?? 0) !== (sessionUser.sessionVersion ?? 0)
    ) {
      destroySession(req);
      respondUnauthenticated(req, res);
      return;
    }

    req.session.adminUser = {
      ...sessionUser,
      username: admin.username,
      role: admin.role,
      mustChangePassword: admin.mustChangePassword,
      sessionVersion: admin.sessionVersion ?? 0
    };

    // Jika admin wajib ganti password sementara (BR-17)
    if (
      req.session.adminUser.mustChangePassword &&
      !req.path.startsWith('/admin/ganti-password') &&
      !req.path.startsWith('/admin/logout')
    ) {
      res.redirect('/admin/ganti-password?notice=must_change');
      return;
    }

    next();
  } catch (err) {
    logger.error({ err, username: sessionUser.username }, 'Gagal memverifikasi sesi admin');
    res.status(500).render('admin/error', {
      title: 'Kesalahan Sistem',
      message: 'Sesi tidak dapat diverifikasi. Silakan coba lagi.'
    });
  }
}

export function requireMaster(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.adminUser || req.session.adminUser.role !== 'MASTER') {
    res.status(403).render('admin/error', {
      title: 'Akses Ditolak',
      message: 'Hanya pengguna dengan wewenang MASTER yang diizinkan mengakses fitur ini.'
    });
    return;
  }

  next();
}
