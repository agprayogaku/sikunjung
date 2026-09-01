import { cleanupOldBackups, createDailyBackup } from '../services/backupService';
import { getDailyRegistration, updateRegistrationStatus } from '../services/registrationService';
import { getNowInJakarta } from '../utils/dateUtils';
import { logger } from '../utils/logger';

let lastExecutedDate = '';

export async function runDailyMaintenance(): Promise<void> {
  const now = getNowInJakarta();
  const todayStr = now.toFormat('yyyy-MM-dd');

  logger.info({ todayStr }, 'Menjalankan pemeliharaan harian (Daily Maintenance)...');

  try {
    // 1. Ubah status pendaftaran yang belum hadir menjadi TIDAK HADIR (BR-12)
    const dailyReg = await getDailyRegistration(todayStr);
    const pendingList = dailyReg.records.filter((r) => r.status === 'MENUNGGU VERIFIKASI');

    for (const record of pendingList) {
      try {
        await updateRegistrationStatus(
          record.registrationNumber,
          'TIDAK HADIR',
          'Sistem (Otomatis 14:30 WIB)',
          'Pengunjung tidak hadir verifikasi fisik loket hingga jam tutup layanan'
        );
      } catch (err) {
        logger.error({ err, regNumber: record.registrationNumber }, 'Gagal menandai TIDAK HADIR');
      }
    }

    // 2. Buat backup otomatis harian (BR-15)
    await createDailyBackup('auto', 'CRON_SISTEM_1430');

    // 3. Bersihkan backup yang melebihi retensi 30 hari
    const deletedCount = await cleanupOldBackups(30);
    logger.info({ deletedCount }, 'Pembersihan retensi backup 30 hari selesai');
  } catch (err) {
    logger.error({ err }, 'Error saat menjalankan daily maintenance');
  }
}

export function startDailyMaintenanceScheduler(): NodeJS.Timeout | null {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  logger.info('Scheduler pemeliharaan harian (14:30 WIB) diaktifkan.');

  const interval = setInterval(async () => {
    const now = getNowInJakarta();
    const todayStr = now.toFormat('yyyy-MM-dd');

    // Jalankan tepat pada pukul 14:30 WIB sekali per hari
    if (now.hour === 14 && now.minute === 30 && lastExecutedDate !== todayStr) {
      lastExecutedDate = todayStr;
      await runDailyMaintenance();
    }
  }, 30 * 1000); // Periksa setiap 30 detik

  return interval;
}
