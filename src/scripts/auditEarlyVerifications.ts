import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { APP_CONFIG } from '../config/appConfig';
import { STORAGE_PATHS } from '../storage/paths';
import { DailyRegistrationFile, RegistrationRecord } from '../types/registration';

interface EarlyVerificationFinding {
  registrationNumber: string;
  visitDate: string;
  status: string;
  verifiedAt: string;
  queueNumber: string | null;
}

async function collectRegistrationFiles(dir: string): Promise<string[]> {
  if (!fs.existsSync(dir)) return [];

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRegistrationFiles(fullPath)));
    } else if (entry.isFile() && /^reg_\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function getVerifiedAt(record: RegistrationRecord): string | null {
  if (record.queueInfo?.verifiedAt) return record.queueInfo.verifiedAt;

  const verificationHistory = record.statusHistory.find(
    (entry) => entry.status === 'HADIR TERVERIFIKASI'
  );
  return verificationHistory?.changedAt ?? null;
}

function isEarlyVerification(record: RegistrationRecord): EarlyVerificationFinding | null {
  const verifiedAt = getVerifiedAt(record);
  if (!verifiedAt) return null;

  const verifiedDate = DateTime.fromISO(verifiedAt, { zone: APP_CONFIG.TIMEZONE });
  if (!verifiedDate.isValid) return null;

  const verifiedDateStr = verifiedDate.toFormat('yyyy-MM-dd');
  if (verifiedDateStr >= record.visitDate) return null;

  return {
    registrationNumber: record.registrationNumber,
    visitDate: record.visitDate,
    status: record.status,
    verifiedAt,
    queueNumber: record.queueInfo?.queueNumber ?? null
  };
}

async function main(): Promise<void> {
  const files = await collectRegistrationFiles(STORAGE_PATHS.REGISTRATIONS_DIR);
  const findings: EarlyVerificationFinding[] = [];
  let invalidFiles = 0;

  for (const filePath of files) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const daily = JSON.parse(content) as DailyRegistrationFile;
      for (const record of daily.records ?? []) {
        const finding = isEarlyVerification(record);
        if (finding) findings.push(finding);
      }
    } catch {
      invalidFiles += 1;
    }
  }

  console.log(`File registrasi dipindai: ${files.length}`);
  console.log(`File tidak valid: ${invalidFiles}`);
  console.log(`Verifikasi sebelum tanggal kunjungan: ${findings.length}`);

  for (const finding of findings) {
    console.log(
      [
        `registrasi=${finding.registrationNumber}`,
        `visitDate=${finding.visitDate}`,
        `verifiedAt=${finding.verifiedAt}`,
        `status=${finding.status}`,
        `queue=${finding.queueNumber ?? '-'}`
      ].join(' | ')
    );
  }

  if (findings.length > 0) {
    console.log('');
    console.log('Tindakan belum dijalankan. Script ini hanya audit read-only.');
    console.log('Backup dulu sebelum melakukan koreksi data secara manual.');
  }
}

main().catch((err) => {
  console.error('Audit gagal:', err);
  process.exitCode = 1;
});
