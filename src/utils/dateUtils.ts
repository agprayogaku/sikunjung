import { DateTime } from 'luxon';
import { APP_CONFIG } from '../config/appConfig';

export function getNowInJakarta(): DateTime {
  return DateTime.now().setZone(APP_CONFIG.TIMEZONE);
}

export function parseDateJakarta(dateStr: string): DateTime {
  return DateTime.fromISO(dateStr, { zone: APP_CONFIG.TIMEZONE });
}

export function calculateAge(birthDateIso: string, referenceDateIso?: string): number {
  const birth = DateTime.fromISO(birthDateIso, { zone: APP_CONFIG.TIMEZONE });
  const ref = referenceDateIso
    ? DateTime.fromISO(referenceDateIso, { zone: APP_CONFIG.TIMEZONE })
    : getNowInJakarta();

  if (!birth.isValid || !ref.isValid) {
    return 0;
  }

  const diff = ref.diff(birth, 'years');
  return Math.floor(diff.years);
}

export function getSaturdayOccurrence(dt: DateTime): number {
  return Math.floor((dt.day - 1) / 7) + 1;
}

export function isH0CutoffPassed(now: DateTime = getNowInJakarta()): boolean {
  const cutoffTime = now.set({
    hour: APP_CONFIG.H0_CUTOFF_HOUR,
    minute: APP_CONFIG.H0_CUTOFF_MINUTE,
    second: 0,
    millisecond: 0
  });

  return now >= cutoffTime;
}

export function formatIndonesianDate(dateStr: string): string {
  const dt = parseDateJakarta(dateStr);
  if (!dt.isValid) return dateStr;
  return dt.setLocale('id').toFormat('cccc, dd MMMM yyyy');
}
