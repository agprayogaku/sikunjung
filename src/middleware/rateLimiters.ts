import rateLimit from 'express-rate-limit';
import { APP_CONFIG } from '../config/appConfig';

function jsonMessage(message: string) {
  return { error: message };
}

export const loginLimiter = rateLimit({
  windowMs: APP_CONFIG.RATE_LIMITS.LOGIN.windowMs,
  limit: APP_CONFIG.RATE_LIMITS.LOGIN.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Login sukses berakhir dengan redirect 302. Login gagal dirender 200,
  // sehingga harus tetap dihitung sebagai percobaan gagal.
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode >= 300 && res.statusCode < 400,
  message: jsonMessage('Terlalu banyak percobaan login. Coba lagi 15 menit lagi.')
});

export const registrationLimiter = rateLimit({
  windowMs: APP_CONFIG.RATE_LIMITS.REGISTRATION_SUBMIT.windowMs,
  limit: APP_CONFIG.RATE_LIMITS.REGISTRATION_SUBMIT.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Terlalu banyak pendaftaran dari jaringan ini. Coba lagi beberapa menit lagi.')
});

export const nikLookupLimiter = rateLimit({
  windowMs: APP_CONFIG.RATE_LIMITS.NIK_LOOKUP.windowMs,
  limit: APP_CONFIG.RATE_LIMITS.NIK_LOOKUP.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Terlalu banyak pencarian NIK. Coba lagi nanti.')
});

export const publicSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Terlalu banyak permintaan. Coba lagi nanti.')
});

export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Terlalu banyak permintaan reset password. Coba lagi 15 menit lagi.')
});

export const cancelLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Terlalu banyak percobaan pembatalan. Coba lagi nanti.')
});

export const statusLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Terlalu banyak percobaan cek status. Coba lagi nanti.')
});
