import { doubleCsrf } from 'csrf-csrf';
import { env } from '../config/env';

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  cookieName: 'sikunjung.csrf',
  size: 32,
  cookieOptions: {
    sameSite: 'lax',
    path: '/',
    secure: env.NODE_ENV === 'production',
    httpOnly: true
  },
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  // Multipart bodies belum ter-parse di middleware global. Route upload memakai
  // doubleCsrfProtection setelah multer. Lihat src/app.ts.
  skipCsrfProtection: (req) => Boolean(req.is('multipart/form-data')),
  getTokenFromRequest: (req) => {
    const bodyToken = req.body && typeof req.body._csrf === 'string' ? req.body._csrf : '';
    return bodyToken || req.headers['x-csrf-token'] || '';
  },
  errorConfig: {
    statusCode: 403,
    message: 'Token CSRF tidak valid. Muat ulang halaman lalu coba lagi.',
    code: 'EBADCSRFTOKEN'
  }
});

export { generateToken as generateCsrfToken, doubleCsrfProtection };
