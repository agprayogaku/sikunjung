import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import session from 'express-session';
import { logger } from '../utils/logger';

export interface SqliteSessionStoreOptions {
  filename: string;
  ttlMs?: number;
  cleanupIntervalMs?: number;
}

interface SessionRow {
  sess: string;
}

interface CountRow {
  count: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

function maskSessionId(sid: string): string {
  return sid.length <= 8 ? 'sesi-...' : `${sid.slice(0, 8)}...`;
}

function getExpiry(sessionData: session.SessionData, ttlMs: number): number {
  const expires = sessionData.cookie?.expires;
  if (expires) {
    const timestamp = expires instanceof Date ? expires.getTime() : new Date(expires).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }

  const maxAge = sessionData.cookie?.originalMaxAge ?? sessionData.cookie?.maxAge;
  if (typeof maxAge === 'number' && Number.isFinite(maxAge)) {
    return Date.now() + maxAge;
  }

  return Date.now() + ttlMs;
}

/**
 * Session store SQLite lintas platform.
 *
 * SQLite menghindari pola write-temp-lalu-rename yang dipakai session-file-store.
 * Pola tersebut rawan EPERM di Windows ketika antivirus atau proses lain memegang
 * handle file sesaat. SQLite memakai locking internal, WAL, dan busy timeout.
 */
export class SqliteSessionStore extends session.Store {
  private readonly db: Database.Database;
  private readonly ttlMs: number;
  private readonly cleanupTimer: NodeJS.Timeout;
  private readonly getStatement: Database.Statement<[string, number], SessionRow>;
  private readonly upsertStatement: Database.Statement<[string, string, number]>;
  private readonly deleteStatement: Database.Statement<[string]>;
  private readonly deleteExpiredStatement: Database.Statement<[number]>;
  private readonly countStatement: Database.Statement<[], CountRow>;
  private readonly clearStatement: Database.Statement<[]>;
  private closed = false;

  constructor(options: SqliteSessionStoreOptions) {
    super();

    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

    if (options.filename !== ':memory:') {
      fs.mkdirSync(path.dirname(options.filename), { recursive: true });
    }

    this.db = new Database(options.filename);
    this.db.pragma('busy_timeout = 5000');

    if (options.filename !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
        ON sessions (expires_at);
    `);

    this.getStatement = this.db.prepare<[string, number], SessionRow>(
      'SELECT sess FROM sessions WHERE sid = ? AND expires_at > ?'
    );
    this.upsertStatement = this.db.prepare<[string, string, number]>(
      `INSERT INTO sessions (sid, sess, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET
         sess = excluded.sess,
         expires_at = excluded.expires_at`
    );
    this.deleteStatement = this.db.prepare<[string]>('DELETE FROM sessions WHERE sid = ?');
    this.deleteExpiredStatement = this.db.prepare<[number]>(
      'DELETE FROM sessions WHERE expires_at <= ?'
    );
    this.countStatement = this.db.prepare<[], CountRow>('SELECT COUNT(*) AS count FROM sessions');
    this.clearStatement = this.db.prepare<[]>('DELETE FROM sessions');

    this.cleanupTimer = setInterval(() => {
      try {
        this.deleteExpiredStatement.run(Date.now());
      } catch (err) {
        logger.warn({ err }, 'Gagal membersihkan sesi SQLite yang kedaluwarsa');
      }
    }, options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void): void {
    try {
      const row = this.getStatement.get(sid, Date.now());
      if (!row) {
        this.deleteStatement.run(sid);
        callback(null, null);
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(row.sess);
      } catch (err) {
        this.deleteStatement.run(sid);
        logger.warn(
          { err, sid: maskSessionId(sid) },
          'Sesi SQLite rusak dihapus dan pengguna diminta membuat sesi baru'
        );
        callback(null, null);
        return;
      }

      if (!parsed || typeof parsed !== 'object') {
        this.deleteStatement.run(sid);
        callback(null, null);
        return;
      }

      callback(null, parsed as session.SessionData);
    } catch (err) {
      callback(err);
    }
  }

  set(
    sid: string,
    sessionData: session.SessionData,
    callback?: (err?: unknown) => void
  ): void {
    try {
      this.upsertStatement.run(
        sid,
        JSON.stringify(sessionData),
        getExpiry(sessionData, this.ttlMs)
      );
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      this.deleteStatement.run(sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid: string, sessionData: session.SessionData, callback?: () => void): void {
    try {
      this.upsertStatement.run(
        sid,
        JSON.stringify(sessionData),
        getExpiry(sessionData, this.ttlMs)
      );
      callback?.();
    } catch (err) {
      logger.warn({ err, sid: maskSessionId(sid) }, 'Gagal memperpanjang sesi SQLite');
      callback?.();
    }
  }

  length(callback: (err: unknown, length?: number) => void): void {
    try {
      const row = this.countStatement.get();
      callback(null, row?.count ?? 0);
    } catch (err) {
      callback(err);
    }
  }

  clear(callback?: (err?: unknown) => void): void {
    try {
      this.clearStatement.run();
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.cleanupTimer);
    this.db.close();
  }
}
