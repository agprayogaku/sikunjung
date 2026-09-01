import express, { Express, NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import multer from 'multer';
import { env } from './config/env';
import { STORAGE_PATHS } from './storage/paths';
import { SqliteSessionStore } from './storage/sqliteSessionStore';
import { ensureStorageLayout } from './bootstrap/ensureStorageLayout';
import { logger } from './utils/logger';
import { formatCellLocation } from './utils/formatCellLocation';
import { doubleCsrfProtection, generateCsrfToken } from './middleware/csrf';
import {
  cancelLimiter,
  loginLimiter,
  nikLookupLimiter,
  passwordResetLimiter,
  publicSearchLimiter,
  registrationLimiter,
  statusLookupLimiter
} from './middleware/rateLimiters';
import {
  downloadProofPdf,
  handlePublicCancel,
  handleRegisterSubmit,
  handleStatusLookup,
  renderHome,
  renderRegister,
  renderRegisterSuccess,
  renderStatus
} from './controllers/publicController';
import {
  availableDatesApi,
  nikLookupApi,
  searchWbpApi
} from './controllers/apiController';
import {
  handleChangePassword,
  handleForgotPassword,
  handleLogin,
  handleLogout,
  renderChangePassword,
  renderForgotPassword,
  renderLogin
} from './controllers/adminAuthController';
import {
  handleApproveReset,
  handleCreateAdmin,
  handleCreateManualBackup,
  handleDeleteAdmin,
  handleDownloadBackup,
  handleExportReportCsv,
  handleRejectReset,
  handleRestoreBackup,
  handleSaveLuggageCategory,
  handleSaveSettings,
  handleUpdateQueueStatus,
  handleUpdateRegistrationStatus,
  handleUpdateWbpStatus,
  handleVerifyArrival,
  handleWbpUpload,
  renderAdminManagement,
  renderAuditLogs,
  renderBackupPage,
  renderDashboard,
  renderLuggageCrud,
  renderPrintTicket,
  renderQueuePage,
  renderRegistrationsList,
  renderReports,
  renderSettings,
  renderVerificationPage,
  renderWbpManagement
} from './controllers/adminPanelController';
import { requireAuth, requireMaster } from './middleware/authMiddleware';

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 menit sliding
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB maks
});

export function createApp(): Express {
  // Pastikan direktori storage siap
  ensureStorageLayout();

  const app = express();
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);

  // Template engine
  app.set('views', path.resolve(process.cwd(), 'views'));
  app.set('view engine', 'ejs');
  app.locals.formatCellLocation = formatCellLocation;

  // Nonce CSP dibuat sebelum helmet agar header dan script inline memakai
  // nilai yang sama pada setiap request.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  // Middleware keamanan & parser
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            (_req: any, res: any) => `'nonce-${res.locals.cspNonce}'`
          ],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null
        }
      }
    })
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static assets
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  // Session
  const sessionStore = new SqliteSessionStore({
    filename: env.NODE_ENV === 'test' ? ':memory:' : STORAGE_PATHS.SESSIONS_DB_FILE,
    ttlMs: SESSION_TTL_MS
  });
  app.locals.sessionStore = sessionStore;

  app.use(
    session({
      store: sessionStore,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_TTL_MS
      }
    })
  );

  // CSRF: token tersedia untuk semua view, validasi semua POST.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.csrfToken = generateCsrfToken(req, res);
    next();
  });
  app.use(doubleCsrfProtection);

  // Healthcheck & Bootstrap Status
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'SIKUNJUNG',
      timestamp: new Date().toISOString()
    });
  });

  // Public Routes (Pengunjung)
  app.get('/', renderHome);
  app.get('/daftar', renderRegister);
  app.post('/daftar', registrationLimiter, handleRegisterSubmit);
  app.get('/daftar/sukses', renderRegisterSuccess);
  app.get('/daftar/pdf/:regNumber', downloadProofPdf);
  app.get('/status', renderStatus);
  app.post('/status', statusLookupLimiter, handleStatusLookup);
  app.post('/status/batal', cancelLimiter, handlePublicCancel);

  // API Endpoints untuk UX Form Interaktif
  app.get('/api/wbp/search', publicSearchLimiter, searchWbpApi);
  app.get('/api/schedule/available-dates', publicSearchLimiter, availableDatesApi);
  app.get('/api/nik/lookup', nikLookupLimiter, nikLookupApi);

  // Admin Auth Routes
  app.get('/admin/login', renderLogin);
  app.post('/admin/login', loginLimiter, handleLogin);
  app.post('/admin/logout', handleLogout);
  app.get('/admin/lupa-password', renderForgotPassword);
  app.post('/admin/lupa-password', passwordResetLimiter, handleForgotPassword);
  app.get('/admin/ganti-password', requireAuth, renderChangePassword);
  app.post('/admin/ganti-password', requireAuth, handleChangePassword);

  // Admin Operational Panel Routes (Protected by requireAuth)
  app.get('/admin/dashboard', requireAuth, renderDashboard);
  app.get('/admin/verifikasi', requireAuth, renderVerificationPage);
  app.post('/admin/verifikasi', requireAuth, handleVerifyArrival);
  app.get('/admin/tiket/:queueNumber', requireAuth, renderPrintTicket);
  app.get('/admin/antrean', requireAuth, renderQueuePage);
  app.post('/admin/antrean/status', requireAuth, handleUpdateQueueStatus);
  app.get('/admin/pendaftaran', requireAuth, renderRegistrationsList);
  app.post('/admin/pendaftaran/status', requireAuth, handleUpdateRegistrationStatus);
  app.get('/admin/wbp', requireAuth, renderWbpManagement);
  app.post('/admin/wbp/status', requireAuth, handleUpdateWbpStatus);
  app.post('/admin/wbp/upload', requireAuth, upload.single('wbpFile'), doubleCsrfProtection, handleWbpUpload);
  app.get('/admin/barang', requireAuth, renderLuggageCrud);
  app.post('/admin/barang', requireAuth, handleSaveLuggageCategory);
  app.get('/admin/pengaturan', requireAuth, renderSettings);
  app.post('/admin/pengaturan', requireAuth, handleSaveSettings);
  app.get('/admin/laporan', requireAuth, renderReports);
  app.get('/admin/laporan/csv', requireAuth, handleExportReportCsv);
  app.get('/admin/audit', requireAuth, renderAuditLogs);
  app.get('/admin/backup', requireAuth, renderBackupPage);
  app.post('/admin/backup/buat', requireAuth, handleCreateManualBackup);
  app.get('/admin/backup/unduh/:filename', requireAuth, handleDownloadBackup);
  app.post('/admin/backup/restore', requireAuth, upload.single('backupZip'), doubleCsrfProtection, handleRestoreBackup);

  // Master Only Routes (requireAuth + requireMaster)
  app.get('/admin/kelola-admin', requireAuth, requireMaster, renderAdminManagement);
  app.post('/admin/kelola-admin/create', requireAuth, requireMaster, handleCreateAdmin);
  app.post('/admin/kelola-admin/delete', requireAuth, requireMaster, handleDeleteAdmin);
  app.post('/admin/kelola-admin/approve-reset', requireAuth, requireMaster, handleApproveReset);
  app.post('/admin/kelola-admin/reject-reset', requireAuth, requireMaster, handleRejectReset);

  // Error handler: CSRF failure dan error tak terduga.
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err?.code === 'EBADCSRFTOKEN') {
      logger.warn({ path: req.path, ip: req.ip }, 'Permintaan ditolak karena token CSRF tidak valid');
      if (req.path.startsWith('/admin')) {
        res.status(403).render('admin/error', {
          title: 'Permintaan Ditolak',
          message: 'Token keamanan tidak valid. Muat ulang halaman lalu coba lagi.'
        });
        return;
      }
      res.status(403).type('text/plain').send('Token keamanan tidak valid. Muat ulang halaman lalu coba lagi.');
      return;
    }

    logger.error({ err, path: req.path }, 'Error tidak tertangani');
    res.status(500).type('text/plain').send('Terjadi kesalahan pada server.');
  });

  return app;
}
