import { DateTime } from 'luxon';
import { isDateAllowedForWbp } from '../../src/services/scheduleService';
import { WbpType } from '../../src/types/wbp';

/**
 * Pilih tanggal kunjungan deterministik: utamakan H+1 s/d H+3 agar tidak
 * bergantung pada jam berjalan, lalu jatuh ke H+0 bila jendela itu kosong.
 */
export function getUpcomingVisitDate(wbpType: WbpType = 'Narapidana'): string {
  const now = DateTime.now().setZone('Asia/Jakarta');

  for (let offset = 1; offset <= 3; offset += 1) {
    const candidate = now.plus({ days: offset }).toFormat('yyyy-MM-dd');
    const result = isDateAllowedForWbp(candidate, wbpType, {
      now,
      closedSpecialDates: [],
      bypassCutoff: true
    });

    if (result.isValid) {
      return candidate;
    }
  }

  // shortcut: jendela H+1..H+3 bisa kosong (mis. Kamis dengan Sabtu minggu ganjil
  // untuk Narapidana); pakai H+0 dengan cutoff asli. upgrade: freeze luxon Settings.now
  // di setup tes bila suite dijalankan setelah pukul 14.30 WIB pada hari tersebut.
  const today = now.toFormat('yyyy-MM-dd');
  const todayResult = isDateAllowedForWbp(today, wbpType, {
    now,
    closedSpecialDates: []
  });
  if (todayResult.isValid) {
    return today;
  }

  throw new Error(`Tidak ada tanggal kunjungan ${wbpType} dalam H+0 s/d H+3.`);
}
