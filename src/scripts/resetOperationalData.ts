import fs from 'fs';
import path from 'path';
import { ensureStorageLayout } from '../bootstrap/ensureStorageLayout';
import { STORAGE_PATHS } from '../storage/paths';
import { getNowInJakarta } from '../utils/dateUtils';

const OPERATIONAL_DIRS = [
  'registrations',
  'queues',
  'indexes',
  'logs',
  'sessions',
  'locks',
  'backups',
  'wbp'
] as const;

const REQUIRED_CONFIG_FILES = [
  STORAGE_PATHS.ADMINS_FILE,
  STORAGE_PATHS.SETTINGS_FILE,
  STORAGE_PATHS.ITEMS_FILE,
  STORAGE_PATHS.PENDING_RESETS_FILE
];

interface DirectoryInfo {
  name: string;
  files: number;
  bytes: number;
}

function collectDirectoryInfo(dirPath: string): { files: number; bytes: number } {
  if (!fs.existsSync(dirPath)) return { files: 0, bytes: 0 };

  let files = 0;
  let bytes = 0;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = collectDirectoryInfo(fullPath);
      files += nested.files;
      bytes += nested.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += fs.statSync(fullPath).size;
    }
  }

  return { files, bytes };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describeOperationalDirs(): DirectoryInfo[] {
  return OPERATIONAL_DIRS.map((name) => ({
    name,
    ...collectDirectoryInfo(path.join(STORAGE_PATHS.ROOT, name))
  }));
}

function assertConfigExists(): void {
  const missing = REQUIRED_CONFIG_FILES.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    throw new Error(
      `Konfigurasi wajib tidak ditemukan: ${missing.map((item) => path.basename(item)).join(', ')}`
    );
  }
}

function createSafetyBackup(): string {
  const timestamp = getNowInJakarta().toFormat('yyyyMMdd_HHmmss');
  const projectRoot = path.dirname(STORAGE_PATHS.ROOT);
  const backupRoot = path.join(projectRoot, 'storage-safety-backups');
  const backupDir = path.join(backupRoot, `pre_reset_${timestamp}`);

  fs.mkdirSync(backupRoot, { recursive: true });
  fs.cpSync(STORAGE_PATHS.ROOT, backupDir, { recursive: true, force: true });

  for (const configFile of REQUIRED_CONFIG_FILES) {
    const relative = path.relative(STORAGE_PATHS.ROOT, configFile);
    if (!fs.existsSync(path.join(backupDir, relative))) {
      throw new Error(`Backup safety tidak lengkap: ${relative} tidak ditemukan.`);
    }
  }

  fs.writeFileSync(
    path.join(backupDir, 'SAFETY_BACKUP_INFO.json'),
    JSON.stringify(
      {
        createdAt: getNowInJakarta().toISO(),
        source: STORAGE_PATHS.ROOT,
        purpose: 'Backup sebelum reset data operasional'
      },
      null,
      2
    ),
    'utf8'
  );

  return backupDir;
}

function verifyJsonIntegrity(): { jsonFiles: number; invalidFiles: string[] } {
  const invalidFiles: string[] = [];
  let jsonFiles = 0;

  function walk(dirPath: string): void {
    if (!fs.existsSync(dirPath)) return;

    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        jsonFiles += 1;
        try {
          JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        } catch {
          invalidFiles.push(path.relative(STORAGE_PATHS.ROOT, fullPath));
        }
      }
    }
  }

  walk(STORAGE_PATHS.ROOT);
  return { jsonFiles, invalidFiles };
}

function removeOperationalData(): void {
  for (const name of OPERATIONAL_DIRS) {
    const dirPath = path.join(STORAGE_PATHS.ROOT, name);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }
}

function main(): void {
  const apply = process.argv.includes('--apply');
  assertConfigExists();

  const dirs = describeOperationalDirs();
  const totalFiles = dirs.reduce((total, dir) => total + dir.files, 0);
  const totalBytes = dirs.reduce((total, dir) => total + dir.bytes, 0);

  console.log(`Storage: ${STORAGE_PATHS.ROOT}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log('Konfigurasi yang dipertahankan: config/admins.json, config/settings.json, config/items.json, config/pending_password_resets.json');
  console.log('');
  console.log('Data operasional yang akan dibersihkan:');

  for (const dir of dirs) {
    console.log(`- ${dir.name}: ${dir.files} file, ${formatBytes(dir.bytes)}`);
  }

  console.log('');
  console.log(`Total: ${totalFiles} file, ${formatBytes(totalBytes)}`);

  if (!apply) {
    console.log('');
    console.log('Dry-run selesai. Tidak ada data yang diubah.');
    console.log('Jalankan ulang dengan --apply untuk backup lalu membersihkan data operasional.');
    return;
  }

  const backupDir = createSafetyBackup();
  console.log('');
  console.log(`Backup safety dibuat: ${backupDir}`);

  removeOperationalData();
  ensureStorageLayout();

  // File kosong mencegah bootstrap mengisi ulang data WBP contoh saat server mulai.
  fs.writeFileSync(STORAGE_PATHS.WBP_DATA_FILE, '[]\n', 'utf8');

  const integrity = verifyJsonIntegrity();
  if (integrity.invalidFiles.length > 0) {
    throw new Error(`JSON tidak valid setelah reset: ${integrity.invalidFiles.join(', ')}`);
  }

  console.log('Data operasional dibersihkan. Konfigurasi tidak diubah.');
  console.log(`File JSON valid: ${integrity.jsonFiles}`);
}

try {
  main();
} catch (err) {
  console.error('Reset data gagal:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
