import fs from 'fs';
import os from 'os';
import path from 'path';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { STORAGE_PATHS } from '../storage/paths';
import { ensureDirExists } from '../storage/jsonStorageEngine';
import { withGlobalLock } from '../storage/fileLockManager';
import { getNowInJakarta } from '../utils/dateUtils';
import { logger, writeAuditLog } from '../utils/logger';
import { clearWbpCache } from './wbpService';
import { clearSettingsCache } from './settingsService';

export interface BackupFileInfo {
  fileName: string;
  type: 'auto' | 'manual';
  sizeBytes: number;
  formattedSize: string;
  createdAt: string;
  filePath: string;
}

const BACKUP_MANIFEST_FILE = 'SIKUNJUNG_BACKUP_MANIFEST.json';
const BACKUP_FORMAT = 'SIKUNJUNG_BACKUP';
const BACKUP_VERSION = 1;
const BACKUP_INCLUDE_DIRS = ['wbp', 'registrations', 'queues', 'indexes', 'config', 'logs'] as const;
const ALLOWED_TOP_LEVEL = new Set<string>([...BACKUP_INCLUDE_DIRS, BACKUP_MANIFEST_FILE]);
const MAX_RESTORE_ENTRIES = 200_000;
const MAX_RESTORE_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024; // 1 GiB

interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  createdBy: string;
  type: 'auto' | 'manual';
  includedDirs: string[];
}

interface RestoreValidation {
  manifest: BackupManifest | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeArchivePath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function validateBackupArchivePath(rawPath: string): string {
  if (!rawPath || rawPath.includes('\0')) {
    throw new Error('Arsip backup berisi nama berkas yang tidak valid.');
  }

  const normalized = normalizeArchivePath(rawPath);
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Arsip backup berisi jalur berbahaya: ${rawPath}`);
  }

  const topLevel = normalized.split('/')[0]!;
  if (!ALLOWED_TOP_LEVEL.has(topLevel)) {
    throw new Error(`Arsip backup berisi folder yang tidak diizinkan: ${topLevel}`);
  }

  return normalized;
}

function validateRestoreArchive(
  directory: unzipper.CentralDirectory
): RestoreValidation {
  if (directory.files.length === 0) {
    throw new Error('Arsip backup kosong.');
  }

  if (directory.files.length > MAX_RESTORE_ENTRIES) {
    throw new Error('Arsip backup memiliki terlalu banyak berkas.');
  }

  let totalUncompressed = 0;
  let manifestSeen = false;

  for (const file of directory.files) {
    const normalized = validateBackupArchivePath(file.path);

    if ((file.flags & 0x1) === 0x1) {
      throw new Error('Arsip backup terenkripsi tidak didukung.');
    }

    const unixMode = (file.externalFileAttributes >>> 16) & 0o170000;
    if (unixMode === 0o120000) {
      throw new Error('Arsip backup berisi symbolic link yang tidak diizinkan.');
    }

    totalUncompressed += file.uncompressedSize || 0;
    if (totalUncompressed > MAX_RESTORE_UNCOMPRESSED_BYTES) {
      throw new Error('Ukuran isi arsip backup melebihi batas aman restore.');
    }

    if (normalized === BACKUP_MANIFEST_FILE) {
      if (manifestSeen) {
        throw new Error('Arsip backup memiliki manifest ganda.');
      }
      manifestSeen = true;
    }
  }

  return { manifest: null };
}

async function readAndValidateManifest(file: unzipper.File): Promise<BackupManifest> {
  let parsed: unknown;

  try {
    const content = await file.buffer();
    parsed = JSON.parse(content.toString('utf8'));
  } catch {
    throw new Error('Manifest backup tidak dapat dibaca atau bukan JSON yang valid.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Manifest backup tidak valid.');
  }

  const manifest = parsed as Partial<BackupManifest>;
  if (manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION) {
    throw new Error('Format atau versi manifest backup tidak didukung.');
  }

  if (!Array.isArray(manifest.includedDirs)) {
    throw new Error('Manifest backup tidak memuat daftar folder.');
  }

  for (const dir of manifest.includedDirs) {
    if (typeof dir !== 'string' || !BACKUP_INCLUDE_DIRS.includes(dir as (typeof BACKUP_INCLUDE_DIRS)[number])) {
      throw new Error('Manifest backup memuat folder yang tidak diizinkan.');
    }
  }

  return manifest as BackupManifest;
}

async function performZipBackup(
  type: 'auto' | 'manual',
  createdBy: string
): Promise<string> {
  const targetDir = type === 'auto' ? STORAGE_PATHS.AUTO_BACKUPS_DIR : STORAGE_PATHS.MANUAL_BACKUPS_DIR;
  ensureDirExists(targetDir);

  const createdAt = getNowInJakarta().toISO() ?? new Date().toISOString();
  const timestamp = getNowInJakarta().toFormat('yyyyMMdd_HHmmss');
  const rand = Math.random().toString(36).slice(2, 6);
  const zipFileName = `backup_${type}_${timestamp}_${rand}.zip`;
  const zipFilePath = path.join(targetDir, zipFileName);

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    createdBy,
    type,
    includedDirs: [...BACKUP_INCLUDE_DIRS]
  };

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    output.on('error', (err) => reject(err));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    archive.append(JSON.stringify(manifest, null, 2), { name: BACKUP_MANIFEST_FILE });

    // Folder yang diarsipkan
    for (const dir of BACKUP_INCLUDE_DIRS) {
      const fullDirPath = path.join(STORAGE_PATHS.ROOT, dir);
      if (fs.existsSync(fullDirPath)) {
        archive.directory(fullDirPath, dir);
      }
    }

    archive.finalize();
  });

  writeAuditLog({
    action: 'BACKUP_CREATED',
    actor: createdBy,
    details: {
      type,
      fileName: zipFileName,
      size: fs.statSync(zipFilePath).size
    }
  });

  logger.info({ zipFilePath }, 'Backup storage berhasil dibuat');
  return zipFilePath;
}

export async function createDailyBackup(
  type: 'auto' | 'manual' = 'auto',
  createdBy = 'Sistem'
): Promise<string> {
  return await withGlobalLock('backup_storage', async () => {
    return await performZipBackup(type, createdBy);
  });
}

export async function cleanupOldBackups(retentionDays = 30): Promise<number> {
  const autoDir = STORAGE_PATHS.AUTO_BACKUPS_DIR;
  if (!fs.existsSync(autoDir)) return 0;

  const nowMs = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  try {
    const files = await fs.promises.readdir(autoDir);
    for (const file of files) {
      if (!file.endsWith('.zip')) continue;
      const fullPath = path.join(autoDir, file);
      const stat = await fs.promises.stat(fullPath);

      if (nowMs - stat.mtimeMs > maxAgeMs) {
        await fs.promises.unlink(fullPath);
        deletedCount++;
        logger.info({ file }, 'Menghapus backup lama sesuai masa retensi');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Gagal membersihkan backup lama');
  }

  return deletedCount;
}

export async function listBackups(): Promise<BackupFileInfo[]> {
  const result: BackupFileInfo[] = [];

  const scanFolder = async (dirPath: string, type: 'auto' | 'manual') => {
    if (!fs.existsSync(dirPath)) return;
    const files = await fs.promises.readdir(dirPath);
    for (const file of files) {
      if (!file.endsWith('.zip')) continue;
      const fullPath = path.join(dirPath, file);
      const stat = await fs.promises.stat(fullPath);
      result.push({
        fileName: file,
        type,
        sizeBytes: stat.size,
        formattedSize: formatBytes(stat.size),
        createdAt: new Date(stat.mtimeMs).toISOString(),
        filePath: fullPath
      });
    }
  };

  await scanFolder(STORAGE_PATHS.AUTO_BACKUPS_DIR, 'auto');
  await scanFolder(STORAGE_PATHS.MANUAL_BACKUPS_DIR, 'manual');

  // Urutkan dari yang paling baru
  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function restoreFromZip(zipFilePath: string, restoredBy: string): Promise<void> {
  if (!fs.existsSync(zipFilePath)) {
    throw new Error('File backup ZIP tidak ditemukan di sistem.');
  }

  return await withGlobalLock('backup_storage', async () => {
    let directory: unzipper.CentralDirectory;
    try {
      directory = await unzipper.Open.file(zipFilePath);
    } catch {
      throw new Error('Berkas restore bukan arsip ZIP yang valid.');
    }

    const validation = validateRestoreArchive(directory);
    const manifestFile = directory.files.find(
      (file) => normalizeArchivePath(file.path) === BACKUP_MANIFEST_FILE
    );

    if (manifestFile) {
      const manifest = await readAndValidateManifest(manifestFile);
      validation.manifest = manifest;
    } else {
      // Kompatibilitas backup lama: tetap aman karena seluruh jalur sudah divalidasi.
      logger.warn({ zipFilePath }, 'Backup lama tanpa manifest, validasi jalur tetap diterapkan');
    }

    const stagingDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sikunjung-restore-'));

    try {
      // 1. Ekstrak ke folder sementara agar data aktif tidak rusak bila ZIP gagal.
      await directory.extract({ path: stagingDir, concurrency: 5 });

      // 2. Buat safety auto-backup sebelum mengganti data aktif.
      await performZipBackup('auto', `Pre-Restore by ${restoredBy}`);

      // 3. Ganti folder data yang tercakup backup secara utuh.
      const restoredDirs: string[] = [];
      for (const dir of BACKUP_INCLUDE_DIRS) {
        const stagedDir = path.join(stagingDir, dir);
        if (!fs.existsSync(stagedDir)) continue;

        const targetDir = path.join(STORAGE_PATHS.ROOT, dir);
        await fs.promises.rm(targetDir, { recursive: true, force: true });
        await fs.promises.cp(stagedDir, targetDir, { recursive: true, force: true });
        restoredDirs.push(dir);
      }

      if (restoredDirs.length === 0) {
        throw new Error('Arsip backup tidak memuat folder data yang dapat dipulihkan.');
      }

      // 4. Reset in-memory cache
      clearWbpCache();
      clearSettingsCache();

      writeAuditLog({
        action: 'STORAGE_RESTORED',
        actor: restoredBy,
        details: {
          zipFile: path.basename(zipFilePath),
          manifest: validation.manifest ? 'validated' : 'legacy',
          restoredDirs
        }
      });

      logger.info({ zipFilePath, restoredDirs }, 'Sistem berhasil dipulihkan (restore) dari file ZIP backup');
    } finally {
      await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
  });
}
