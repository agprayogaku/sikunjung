export const APP_CONFIG = {
  APP_NAME: 'SIKUNJUNG',
  APP_FULL_NAME: 'Sistem Informasi Pendaftaran Kunjungan Online Lapas Kelas IIB Purwakarta',
  TIMEZONE: 'Asia/Jakarta',
  DEFAULT_MAX_REGISTRATIONS: 40,
  DEFAULT_MAX_VISITORS: 60,
  H0_CUTOFF_HOUR: 14,
  H0_CUTOFF_MINUTE: 30,
  MAX_DAYS_AHEAD: 3,
  BACKUP_RETENTION_DAYS: 30,
  SESSION_TIMEOUT_MINUTES: 30,
  PASSWORD_POLICY: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSymbol: true
  },
  RATE_LIMITS: {
    LOGIN: { max: 5, windowMs: 15 * 60 * 1000 },
    REGISTRATION_SUBMIT: { max: 5, windowMs: 10 * 60 * 1000 },
    NIK_LOOKUP: { max: 10, windowMs: 60 * 1000 }
  }
};
