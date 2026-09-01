import { DateTime } from 'luxon';
import { APP_CONFIG } from '../config/appConfig';
import { WbpType } from '../types/wbp';
import { getNowInJakarta, getSaturdayOccurrence, parseDateJakarta } from '../utils/dateUtils';
import { getSettings } from './settingsService';

export interface ScheduleValidationResult {
  isValid: boolean;
  reason?: string;
}

export interface AvailableDateOption {
  dateStr: string;
  formattedDate: string;
  dayName: string;
  isToday: boolean;
  available: boolean;
  reason?: string;
}

export { getSaturdayOccurrence };

export function isDateWithinBookingWindow(
  visitDateStr: string,
  now: DateTime = getNowInJakarta()
): { inWindow: boolean; isToday: boolean; reason?: string } {
  const visitDt = parseDateJakarta(visitDateStr).startOf('day');
  const todayDt = now.startOf('day');

  if (!visitDt.isValid) {
    return { inWindow: false, isToday: false, reason: 'Format tanggal kunjungan tidak valid.' };
  }

  const diffDays = Math.round(visitDt.diff(todayDt, 'days').days);

  if (diffDays < 0) {
    return { inWindow: false, isToday: false, reason: 'Tanggal kunjungan tidak boleh di masa lampau.' };
  }

  if (diffDays > APP_CONFIG.MAX_DAYS_AHEAD) {
    return {
      inWindow: false,
      isToday: false,
      reason: `Pendaftaran hanya dapat dilakukan maksimal H+${APP_CONFIG.MAX_DAYS_AHEAD} hari.`
    };
  }

  const isToday = diffDays === 0;

  if (isToday) {
    // Pada hari Sabtu kunjungan tutup 11:30, sedangkan hari kerja (Senin-Kamis) tutup 14:30
    const cutoffHour = now.weekday === 6 ? 11 : APP_CONFIG.H0_CUTOFF_HOUR;
    const cutoffMinute = now.weekday === 6 ? 30 : APP_CONFIG.H0_CUTOFF_MINUTE;

    const cutoffTime = now.set({
      hour: cutoffHour,
      minute: cutoffMinute,
      second: 0,
      millisecond: 0
    });

    if (now >= cutoffTime) {
      return {
        inWindow: false,
        isToday: true,
        reason: `Pendaftaran untuk hari ini (H+0) sudah ditutup pukul ${cutoffHour.toString().padStart(2, '0')}:${cutoffMinute.toString().padStart(2, '0')} WIB.`
      };
    }
  }

  return { inWindow: true, isToday };
}

export function isDateAllowedForWbp(
  visitDateStr: string,
  wbpType: WbpType,
  options?: {
    closedSpecialDates?: string[];
    now?: DateTime;
    bypassCutoff?: boolean;
  }
): ScheduleValidationResult {
  const now = options?.now ?? getNowInJakarta();
  const dt = parseDateJakarta(visitDateStr);

  if (!dt.isValid) {
    return { isValid: false, reason: 'Format tanggal kunjungan tidak valid.' };
  }

  // 1. Validasi jendela booking (H+0 s/d H+3)
  if (!options?.bypassCutoff) {
    const windowCheck = isDateWithinBookingWindow(visitDateStr, now);
    if (!windowCheck.inWindow) {
      return { isValid: false, reason: windowCheck.reason };
    }
  }

  // 2. Cek tanggal tutup khusus instansi
  const closedDates = options?.closedSpecialDates ?? [];
  if (closedDates.includes(visitDateStr)) {
    return { isValid: false, reason: 'Layanan kunjungan ditutup pada tanggal ini sesuai ketentuan dinas.' };
  }

  const weekday = dt.weekday; // 1 = Senin, ..., 5 = Jumat, 6 = Sabtu, 7 = Minggu

  // 3. Jumat (5) & Minggu (7) selalu tutup
  if (weekday === 5 || weekday === 7) {
    return { isValid: false, reason: 'Layanan kunjungan tidak beroperasi pada hari Jumat dan Minggu.' };
  }

  // 4. Jadwal Narapidana: Senin (1), Selasa (2), Kamis (4), Sabtu Minggu 2 & 4
  if (wbpType === 'Narapidana') {
    if (weekday === 1 || weekday === 2 || weekday === 4) {
      return { isValid: true };
    }

    if (weekday === 6) {
      const satWeek = getSaturdayOccurrence(dt);
      if (satWeek === 2 || satWeek === 4) {
        return { isValid: true };
      }
      return {
        isValid: false,
        reason: `Hari Sabtu ini (Minggu ke-${satWeek}) dikhususkan untuk kunjungan Tahanan. Jadwal Narapidana adalah Sabtu Minggu ke-2 dan ke-4.`
      };
    }

    if (weekday === 3) {
      return { isValid: false, reason: 'Hari Rabu dikhususkan untuk kunjungan Tahanan.' };
    }

    return { isValid: false, reason: 'Jadwal kunjungan Narapidana adalah Senin, Selasa, Kamis, dan Sabtu (Minggu 2 & 4).' };
  }

  // 5. Jadwal Tahanan: Senin (1), Rabu (3), Sabtu Minggu 1, 3, & 5
  if (wbpType === 'Tahanan') {
    if (weekday === 1 || weekday === 3) {
      return { isValid: true };
    }

    if (weekday === 6) {
      const satWeek = getSaturdayOccurrence(dt);
      if (satWeek === 1 || satWeek === 3 || satWeek === 5) {
        return { isValid: true };
      }
      return {
        isValid: false,
        reason: `Hari Sabtu ini (Minggu ke-${satWeek}) dikhususkan untuk kunjungan Narapidana. Jadwal Tahanan adalah Sabtu Minggu ke-1, ke-3, dan ke-5.`
      };
    }

    if (weekday === 2 || weekday === 4) {
      return { isValid: false, reason: 'Hari Selasa dan Kamis dikhususkan untuk kunjungan Narapidana.' };
    }

    return { isValid: false, reason: 'Jadwal kunjungan Tahanan adalah Senin, Rabu, dan Sabtu (Minggu 1, 3, dan 5).' };
  }

  return { isValid: false, reason: 'Status WBP tidak valid.' };
}

export async function getAvailableDatesForWbp(
  wbpType: WbpType,
  options?: {
    now?: DateTime;
    closedSpecialDates?: string[];
  }
): Promise<AvailableDateOption[]> {
  const now = options?.now ?? getNowInJakarta();
  let closedDates = options?.closedSpecialDates;

  if (!closedDates) {
    try {
      const settings = await getSettings();
      closedDates = settings.closedSpecialDates ?? [];
    } catch {
      closedDates = [];
    }
  }

  const result: AvailableDateOption[] = [];

  for (let i = 0; i <= APP_CONFIG.MAX_DAYS_AHEAD; i++) {
    const targetDt = now.plus({ days: i });
    const dateStr = targetDt.toFormat('yyyy-MM-dd');
    const formattedDate = targetDt.setLocale('id').toFormat('cccc, dd MMMM yyyy');
    const dayName = targetDt.setLocale('id').toFormat('cccc');
    const isToday = i === 0;

    const validation = isDateAllowedForWbp(dateStr, wbpType, {
      closedSpecialDates: closedDates,
      now
    });

    result.push({
      dateStr,
      formattedDate,
      dayName,
      isToday,
      available: validation.isValid,
      reason: validation.reason
    });
  }

  return result;
}
