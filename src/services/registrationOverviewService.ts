import { DateTime } from 'luxon';
import { APP_CONFIG } from '../config/appConfig';
import { getDailyRegistration } from './registrationService';
import { formatIndonesianDate, getNowInJakarta } from '../utils/dateUtils';

export interface RegistrationDayOverview {
  dateStr: string;
  formattedDate: string;
  totalRegistrations: number;
  waitingVerification: number;
}

export interface RegistrationOverview {
  today: RegistrationDayOverview;
  upcoming: RegistrationDayOverview[];
  upcomingTotalRegistrations: number;
  upcomingWaitingVerification: number;
  totalPendingAllDates: number;
}

async function summarizeDay(dateStr: string): Promise<RegistrationDayOverview> {
  const daily = await getDailyRegistration(dateStr);

  return {
    dateStr,
    formattedDate: formatIndonesianDate(dateStr),
    totalRegistrations: daily.records.length,
    waitingVerification: daily.records.filter(
      (record) => record.status === 'MENUNGGU VERIFIKASI'
    ).length
  };
}

/**
 * Ringkasan H+0 sampai H+3. Dashboard tetap menampilkan booking tanggal lain
 * tanpa mengubah aturan verifikasi yang hanya boleh pada tanggal kunjungan.
 */
export async function getRegistrationOverview(
  now: DateTime = getNowInJakarta()
): Promise<RegistrationOverview> {
  const dates = Array.from({ length: APP_CONFIG.MAX_DAYS_AHEAD + 1 }, (_, offset) =>
    now.plus({ days: offset }).toFormat('yyyy-MM-dd')
  );

  const days = await Promise.all(dates.map((dateStr) => summarizeDay(dateStr)));
  const today = days[0]!;
  const upcoming = days.slice(1);
  const upcomingTotalRegistrations = upcoming.reduce(
    (total, day) => total + day.totalRegistrations,
    0
  );
  const upcomingWaitingVerification = upcoming.reduce(
    (total, day) => total + day.waitingVerification,
    0
  );

  return {
    today,
    upcoming,
    upcomingTotalRegistrations,
    upcomingWaitingVerification,
    totalPendingAllDates: today.waitingVerification + upcomingWaitingVerification
  };
}
