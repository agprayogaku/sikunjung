import fs from 'fs';
import os from 'os';
import path from 'path';
import type { SessionData } from 'express-session';
import { SqliteSessionStore } from '../../src/storage/sqliteSessionStore';

function makeSession(value: string, expiresAt: number): SessionData {
  return {
    value,
    cookie: {
      maxAge: expiresAt - Date.now(),
      originalMaxAge: expiresAt - Date.now(),
      expires: new Date(expiresAt)
    }
  } as unknown as SessionData;
}

function setSession(
  store: SqliteSessionStore,
  sid: string,
  sessionData: SessionData
): Promise<void> {
  return new Promise((resolve, reject) => {
    store.set(sid, sessionData, (err) => (err ? reject(err) : resolve()));
  });
}

function getSession(store: SqliteSessionStore, sid: string): Promise<SessionData | null> {
  return new Promise((resolve, reject) => {
    store.get(sid, (err, sessionData) => (err ? reject(err) : resolve(sessionData ?? null)));
  });
}

describe('SqliteSessionStore', () => {
  let workDir: string;
  let dbPath: string;
  let store: SqliteSessionStore;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sikunjung-session-test-'));
    dbPath = path.join(workDir, 'sessions.db');
    store = new SqliteSessionStore({ filename: dbPath, cleanupIntervalMs: 60_000 });
  });

  afterEach(() => {
    store.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('menyimpan dan membaca sesi dari SQLite', async () => {
    const sessionData = makeSession('data-uji', Date.now() + 60_000);

    await setSession(store, 'sid-001', sessionData);

    const loaded = await getSession(store, 'sid-001');
    expect(loaded).toMatchObject({ value: 'data-uji' });
  });

  it('memperbarui sesi saat touch dan menghapus sesi kedaluwarsa', async () => {
    await setSession(store, 'sid-002', makeSession('awal', Date.now() + 60_000));

    await new Promise<void>((resolve) => {
      store.touch('sid-002', makeSession('diperbarui', Date.now() + 120_000), resolve);
    });

    const updated = await getSession(store, 'sid-002');
    expect(updated).toMatchObject({ value: 'diperbarui' });

    await setSession(store, 'sid-expired', makeSession('lama', Date.now() - 1_000));
    expect(await getSession(store, 'sid-expired')).toBeNull();
  });

  it('menghapus sesi dengan destroy, length, dan clear', async () => {
    await setSession(store, 'sid-003', makeSession('hapus', Date.now() + 60_000));
    await setSession(store, 'sid-004', makeSession('hapus-semua', Date.now() + 60_000));

    await new Promise<void>((resolve, reject) => {
      store.destroy('sid-003', (err) => (err ? reject(err) : resolve()));
    });
    expect(await getSession(store, 'sid-003')).toBeNull();

    const length = await new Promise<number>((resolve, reject) => {
      store.length((err, count) => (err ? reject(err) : resolve(count ?? 0)));
    });
    expect(length).toBe(1);

    await new Promise<void>((resolve, reject) => {
      store.clear((err) => (err ? reject(err) : resolve()));
    });
    expect(await getSession(store, 'sid-004')).toBeNull();
  });

  it('mempertahankan sesi setelah store dibuka ulang', async () => {
    await setSession(store, 'sid-persist', makeSession('tetap-ada', Date.now() + 60_000));
    store.close();

    const reopened = new SqliteSessionStore({
      filename: dbPath,
      cleanupIntervalMs: 60_000
    });
    try {
      const loaded = await getSession(reopened, 'sid-persist');
      expect(loaded).toMatchObject({ value: 'tetap-ada' });
    } finally {
      reopened.close();
    }
  });
});
