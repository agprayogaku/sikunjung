import type { Response } from 'supertest';

export function csrfTokenFrom(response: Response): string {
  const match = response.text.match(/<meta name="csrf-token" content="([^"]+)"/);
  if (!match || !match[1]) {
    throw new Error('Token CSRF tidak ditemukan pada halaman.');
  }
  return match[1];
}
