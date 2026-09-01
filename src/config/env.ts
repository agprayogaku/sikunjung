import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  TZ: z.string().default('Asia/Jakarta'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET minimal 32 karakter. Gunakan nilai acak unik.'),
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET minimal 32 karakter.').optional(),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  BASE_URL: z.string().default('http://localhost:3000'),
  ADMIN_MASTER_USERNAME: z.string().default('master'),
  ADMIN_MASTER_INITIAL_PASSWORD: z
    .string()
    .min(12, 'ADMIN_MASTER_INITIAL_PASSWORD minimal 12 karakter.')
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  CSRF_SECRET:
    parsed.CSRF_SECRET ??
    crypto.createHash('sha256').update(`${parsed.SESSION_SECRET}:csrf`).digest('hex')
};
