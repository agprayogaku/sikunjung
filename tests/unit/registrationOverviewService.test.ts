import { DateTime } from 'luxon';
import { getRegistrationOverview } from '../../src/services/registrationOverviewService';
import { atomicWriteJson, removeFileSafe } from '../../src/storage/jsonStorageEngine';
import { getRegistrationFilePath } from '../../src/storage/paths';
import {
  DailyRegistrationFile,
  RegistrationRecord,
  RegistrationStatus
} from '../../src/types/registration';

describe('Registration Overview Service (H+0 s/d H+3)', () => {
  const now = DateTime.fromISO('2030-05-06T09:00:00', { zone: 'Asia/Jakarta' });
  const dateStrs = [0, 1, 2, 3].map((offset) =>
    now.plus({ days: offset }).toFormat('yyyy-MM-dd')
  );

  function makeDailyFile(dateStr: string, statuses: RegistrationStatus[]): DailyRegistrationFile {
    const records = statuses.map(
      (status, index) =>
        ({
          id: `overview-test-${dateStr}-${index}`,
          registrationNumber: `REG-OVERVIEW-${dateStr}-${index}`,
          visitDate: dateStr,
          status
        }) as unknown as RegistrationRecord
    );

    return {
      visitDate: dateStr,
      updatedAt: now.toISO() ?? new Date().toISOString(),
      guard: {
        activeWbp: [],
        activeNiks: [],
        capacityUsed: {
          registrations: records.length,
          visitors: records.length
        }
      },
      records
    };
  }

  beforeAll(async () => {
    await atomicWriteJson(
      getRegistrationFilePath(dateStrs[0]!),
      makeDailyFile(dateStrs[0]!, ['MENUNGGU VERIFIKASI', 'HADIR TERVERIFIKASI'])
    );
    await atomicWriteJson(
      getRegistrationFilePath(dateStrs[1]!),
      makeDailyFile(dateStrs[1]!, ['MENUNGGU VERIFIKASI'])
    );
    await atomicWriteJson(getRegistrationFilePath(dateStrs[2]!), makeDailyFile(dateStrs[2]!, []));
    await atomicWriteJson(
      getRegistrationFilePath(dateStrs[3]!),
      makeDailyFile(dateStrs[3]!, ['MENUNGGU VERIFIKASI', 'DIBATALKAN'])
    );
  });

  afterAll(async () => {
    await Promise.all(dateStrs.map((dateStr) => removeFileSafe(getRegistrationFilePath(dateStr))));
  });

  it('memisahkan total hari ini dari booking H+1 sampai H+3', async () => {
    const overview = await getRegistrationOverview(now);

    expect(overview.today.dateStr).toBe(dateStrs[0]);
    expect(overview.today.totalRegistrations).toBe(2);
    expect(overview.today.waitingVerification).toBe(1);

    expect(overview.upcoming).toHaveLength(3);
    expect(overview.upcoming.map((day) => day.dateStr)).toEqual([
      dateStrs[1],
      dateStrs[2],
      dateStrs[3]
    ]);
    expect(overview.upcoming.map((day) => day.totalRegistrations)).toEqual([1, 0, 2]);
    expect(overview.upcoming.map((day) => day.waitingVerification)).toEqual([1, 0, 1]);

    expect(overview.upcomingTotalRegistrations).toBe(3);
    expect(overview.upcomingWaitingVerification).toBe(2);
    expect(overview.totalPendingAllDates).toBe(3);
    expect(overview.upcoming[0]!.formattedDate).toContain('Mei 2030');
  });
});
