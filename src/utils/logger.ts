import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { APP_CONFIG } from '../config/appConfig';
import { STORAGE_PATHS } from '../storage/paths';

const LOGS_DIR = STORAGE_PATHS.LOGS_DIR;

// Ensure log dir exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss'
          }
        }
      : undefined
});

export interface AuditLogEntry {
  timestamp: string;
  action: string;
  actor: string;
  ip?: string;
  details?: Record<string, unknown>;
}

export function writeAuditLog(entry: Omit<AuditLogEntry, 'timestamp'>): void {
  try {
    const now = DateTime.now().setZone(APP_CONFIG.TIMEZONE);
    const monthStr = now.toFormat('yyyy-MM');
    const logFilePath = path.join(LOGS_DIR, `audit_${monthStr}.log`);

    const fullEntry: AuditLogEntry = {
      timestamp: now.toISO() ?? new Date().toISOString(),
      ...entry
    };

    const line = JSON.stringify(fullEntry) + '\n';
    fs.appendFileSync(logFilePath, line, 'utf8');
  } catch (err) {
    logger.error({ err }, 'Gagal mencatat audit log');
  }
}
