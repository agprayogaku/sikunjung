import fs from 'fs';
import os from 'os';
import path from 'path';
import archiver from 'archiver';
import {
  cleanupOldBackups,
  createDailyBackup,
  listBackups,
  restoreFromZip,
  validateBackupArchivePath
} from '../../src/services/backupService';

async function createZipWithEntries(
  zipPath: string,
  entries: Array<{ name: string; content: string }>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    for (const entry of entries) {
      archive.append(entry.content, { name: entry.name });
    }
    archive.finalize();
  });
}

describe('Backup & Restore Service Tests (BR-15, FR A12)', () => {
  let createdBackupZip: string;
  let workDir: string;

  beforeAll(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sikunjung-backup-test-'));
  });

  afterAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('createDailyBackup membuat file arsip ZIP storage yang valid', async () => {
    createdBackupZip = await createDailyBackup('auto', 'test_runner');

    expect(fs.existsSync(createdBackupZip)).toBe(true);
    expect(createdBackupZip.endsWith('.zip')).toBe(true);

    const stat = fs.statSync(createdBackupZip);
    expect(stat.size).toBeGreaterThan(100); // Harus berisi direktori data
  });

  it('listBackups mengembalikan daftar file backup beserta ukuran dan tipenya', async () => {
    const list = await listBackups();

    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);

    const found = list.find((b) => b.filePath === createdBackupZip);
    expect(found).toBeDefined();
    expect(found?.type).toBe('auto');
    expect(found?.sizeBytes).toBeGreaterThan(0);
  });

  it('restoreFromZip dapat memulihkan isi arsip dan membuat safety backup terlebih dahulu', async () => {
    const preCount = (await listBackups()).length;

    await restoreFromZip(createdBackupZip, 'test_restorer');

    const postCount = (await listBackups()).length;
    // Safety backup otomatis dibuat sebelum restore, sehingga jumlah backup bertambah 1
    expect(postCount).toBeGreaterThanOrEqual(preCount + 1);
  }, 15000);

  it('menolak jalur path traversal dan jalur absolut pada validasi arsip', () => {
    expect(() => validateBackupArchivePath('../evil-sikunjung.txt')).toThrow('jalur berbahaya');
    expect(() => validateBackupArchivePath('wbp/../../evil-sikunjung.txt')).toThrow('jalur berbahaya');
    expect(() => validateBackupArchivePath('C:\\Windows\\evil.txt')).toThrow('jalur berbahaya');
    expect(() => validateBackupArchivePath('/etc/passwd')).toThrow('jalur berbahaya');
    expect(() => validateBackupArchivePath('wbp\\data.json')).not.toThrow();
  });

  it('menolak ZIP yang memuat folder di luar daftar folder backup', async () => {
    const zipPath = path.join(workDir, 'unexpected-folder.zip');
    await createZipWithEntries(zipPath, [
      { name: 'sessions/session.json', content: '{}' }
    ]);

    await expect(restoreFromZip(zipPath, 'test_restorer')).rejects.toThrow('folder yang tidak diizinkan');
  });

  it('menolak manifest backup yang rusak atau tidak sesuai format', async () => {
    const zipPath = path.join(workDir, 'bad-manifest.zip');
    await createZipWithEntries(zipPath, [
      { name: 'SIKUNJUNG_BACKUP_MANIFEST.json', content: '{not-json' },
      { name: 'wbp/data.json', content: '[]' }
    ]);

    await expect(restoreFromZip(zipPath, 'test_restorer')).rejects.toThrow('Manifest backup');
  });

  it('cleanupOldBackups menghapus backup yang melampaui retensi', async () => {
    // Jalankan cleanup dengan retensi 30 hari (backup baru tidak akan terhapus)
    const deletedCount = await cleanupOldBackups(30);
    expect(deletedCount).toBe(0);
  });
});
