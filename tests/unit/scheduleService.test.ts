import { DateTime } from 'luxon';
import {
  getAvailableDatesForWbp,
  getSaturdayOccurrence,
  isDateAllowedForWbp,
  isDateWithinBookingWindow
} from '../../src/services/scheduleService';

describe('Schedule Service & Saturday Rotation Engine', () => {
  const zone = 'Asia/Jakarta';

  describe('getSaturdayOccurrence', () => {
    it('harus menghitung nomor minggu Sabtu dalam sebulan dengan benar', () => {
      // 2026-11-07 -> day 7 -> floor(6/7) + 1 = 1 (Minggu ke-1)
      const sat1 = DateTime.fromISO('2026-11-07', { zone });
      expect(getSaturdayOccurrence(sat1)).toBe(1);

      // 2026-11-14 -> day 14 -> floor(13/7) + 1 = 2 (Minggu ke-2)
      const sat2 = DateTime.fromISO('2026-11-14', { zone });
      expect(getSaturdayOccurrence(sat2)).toBe(2);

      // 2026-11-21 -> day 21 -> floor(20/7) + 1 = 3 (Minggu ke-3)
      const sat3 = DateTime.fromISO('2026-11-21', { zone });
      expect(getSaturdayOccurrence(sat3)).toBe(3);

      // 2026-11-28 -> day 28 -> floor(27/7) + 1 = 4 (Minggu ke-4)
      const sat4 = DateTime.fromISO('2026-11-28', { zone });
      expect(getSaturdayOccurrence(sat4)).toBe(4);

      // Contoh bulan dengan 5 Sabtu: Mei 2026 (Sabtu tgl 2, 9, 16, 23, 30)
      const sat5 = DateTime.fromISO('2026-05-30', { zone });
      expect(getSaturdayOccurrence(sat5)).toBe(5);
    });
  });

  describe('isDateWithinBookingWindow (BR-02, TC 03, TC 04, TC 05)', () => {
    it('TC 03: H+0 sebelum jam cutoff diizinkan', () => {
      const now = DateTime.fromISO('2026-11-09T09:00:00', { zone }); // Senin pagi
      const check = isDateWithinBookingWindow('2026-11-09', now);
      expect(check.inWindow).toBe(true);
      expect(check.isToday).toBe(true);
    });

    it('TC 04: H+0 setelah jam cutoff (14:30 hari kerja / 11:30 Sabtu) ditolak', () => {
      // Senin lewat 14:30
      const nowWeekday = DateTime.fromISO('2026-11-09T14:35:00', { zone });
      const checkWeekday = isDateWithinBookingWindow('2026-11-09', nowWeekday);
      expect(checkWeekday.inWindow).toBe(false);
      expect(checkWeekday.reason).toContain('sudah ditutup');

      // Sabtu lewat 11:30
      const nowSaturday = DateTime.fromISO('2026-11-14T11:35:00', { zone });
      const checkSaturday = isDateWithinBookingWindow('2026-11-14', nowSaturday);
      expect(checkSaturday.inWindow).toBe(false);
      expect(checkSaturday.reason).toContain('sudah ditutup');
    });

    it('TC 05: H+4 ditolak karena di luar batas maksimal booking 3 hari', () => {
      const now = DateTime.fromISO('2026-11-09T09:00:00', { zone });
      // H+4 = 2026-11-13
      const check = isDateWithinBookingWindow('2026-11-13', now);
      expect(check.inWindow).toBe(false);
      expect(check.reason).toContain('maksimal H+3');
    });

    it('tanggal di masa lampau ditolak', () => {
      const now = DateTime.fromISO('2026-11-09T09:00:00', { zone });
      const check = isDateWithinBookingWindow('2026-11-08', now);
      expect(check.inWindow).toBe(false);
      expect(check.reason).toContain('masa lampau');
    });
  });

  describe('isDateAllowedForWbp (BR-01, BR-03, TC 06, TC 07, TC 08a-e)', () => {
    it('TC 06: Hari Jumat (5) selalu ditolak', () => {
      // 2026-11-13 adalah Jumat
      const now = DateTime.fromISO('2026-11-10T09:00:00', { zone });
      const resultNapi = isDateAllowedForWbp('2026-11-13', 'Narapidana', { now });
      const resultTahanan = isDateAllowedForWbp('2026-11-13', 'Tahanan', { now });

      expect(resultNapi.isValid).toBe(false);
      expect(resultNapi.reason).toContain('Jumat');
      expect(resultTahanan.isValid).toBe(false);
      expect(resultTahanan.reason).toContain('Jumat');
    });

    it('TC 07: Hari Minggu (7) selalu ditolak', () => {
      // 2026-11-08 adalah Minggu
      const now = DateTime.fromISO('2026-11-06T09:00:00', { zone });
      const result = isDateAllowedForWbp('2026-11-08', 'Narapidana', { now });

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Minggu');
    });

    it('TC 08a: Narapidana pada Sabtu minggu ke-1 ditolak', () => {
      // 2026-11-07 adalah Sabtu minggu ke-1
      const now = DateTime.fromISO('2026-11-05T09:00:00', { zone });
      const result = isDateAllowedForWbp('2026-11-07', 'Narapidana', { now });

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Sabtu ini (Minggu ke-1) dikhususkan untuk kunjungan Tahanan');
    });

    it('TC 08b: Narapidana pada Sabtu minggu ke-2 diizinkan', () => {
      // 2026-11-14 adalah Sabtu minggu ke-2
      const now = DateTime.fromISO('2026-11-12T09:00:00', { zone });
      const result = isDateAllowedForWbp('2026-11-14', 'Narapidana', { now });

      expect(result.isValid).toBe(true);
    });

    it('TC 08c: Tahanan pada Sabtu minggu ke-1 diizinkan', () => {
      // 2026-11-07 adalah Sabtu minggu ke-1
      const now = DateTime.fromISO('2026-11-05T09:00:00', { zone });
      const result = isDateAllowedForWbp('2026-11-07', 'Tahanan', { now });

      expect(result.isValid).toBe(true);
    });

    it('TC 08d: Tahanan pada Sabtu minggu ke-2 ditolak', () => {
      // 2026-11-14 adalah Sabtu minggu ke-2
      const now = DateTime.fromISO('2026-11-12T09:00:00', { zone });
      const result = isDateAllowedForWbp('2026-11-14', 'Tahanan', { now });

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Sabtu ini (Minggu ke-2) dikhususkan untuk kunjungan Narapidana');
    });

    it('TC 08e: Tahanan pada Sabtu minggu ke-5 diizinkan', () => {
      // 2026-05-30 adalah Sabtu minggu ke-5
      const now = DateTime.fromISO('2026-05-28T09:00:00', { zone });
      const result = isDateAllowedForWbp('2026-05-30', 'Tahanan', { now });

      expect(result.isValid).toBe(true);
    });

    it('jadwal weekday Narapidana (Senin, Selasa, Kamis) vs Tahanan (Senin, Rabu)', () => {
      const now = DateTime.fromISO('2026-11-09T09:00:00', { zone }); // Senin
      // Senin (2026-11-09) boleh untuk keduanya
      expect(isDateAllowedForWbp('2026-11-09', 'Narapidana', { now }).isValid).toBe(true);
      expect(isDateAllowedForWbp('2026-11-09', 'Tahanan', { now }).isValid).toBe(true);

      // Selasa (2026-11-10) boleh Narapidana, ditolak Tahanan
      expect(isDateAllowedForWbp('2026-11-10', 'Narapidana', { now }).isValid).toBe(true);
      expect(isDateAllowedForWbp('2026-11-10', 'Tahanan', { now }).isValid).toBe(false);

      // Rabu (2026-11-11) ditolak Narapidana, boleh Tahanan
      expect(isDateAllowedForWbp('2026-11-11', 'Narapidana', { now }).isValid).toBe(false);
      expect(isDateAllowedForWbp('2026-11-11', 'Tahanan', { now }).isValid).toBe(true);

      // Kamis (2026-11-12) boleh Narapidana, ditolak Tahanan
      expect(isDateAllowedForWbp('2026-11-12', 'Narapidana', { now }).isValid).toBe(true);
      expect(isDateAllowedForWbp('2026-11-12', 'Tahanan', { now }).isValid).toBe(false);
    });

    it('menolak jika tanggal termasuk dalam closedSpecialDates', () => {
      const now = DateTime.fromISO('2026-11-09T09:00:00', { zone });
      const result = isDateAllowedForWbp('2026-11-10', 'Narapidana', {
        now,
        closedSpecialDates: ['2026-11-10']
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('ditutup pada tanggal ini');
    });
  });

  describe('getAvailableDatesForWbp', () => {
    it('mengembalikan 4 opsi tanggal (H+0 s/d H+3) dengan status ketersediaan yang akurat', async () => {
      // Sekarang hari Kamis 2026-11-12 jam 10:00
      const now = DateTime.fromISO('2026-11-12T10:00:00', { zone });
      const dates = await getAvailableDatesForWbp('Narapidana', { now });

      expect(dates.length).toBe(4);
      // H+0: Kamis (12) -> Narapidana AVAILABLE
      expect(dates[0]?.dateStr).toBe('2026-11-12');
      expect(dates[0]?.available).toBe(true);

      // H+1: Jumat (13) -> CLOSED
      expect(dates[1]?.dateStr).toBe('2026-11-13');
      expect(dates[1]?.available).toBe(false);

      // H+2: Sabtu (14) -> Minggu ke-2 -> Narapidana AVAILABLE
      expect(dates[2]?.dateStr).toBe('2026-11-14');
      expect(dates[2]?.available).toBe(true);

      // H+3: Minggu (15) -> CLOSED
      expect(dates[3]?.dateStr).toBe('2026-11-15');
      expect(dates[3]?.available).toBe(false);
    });
  });
});
