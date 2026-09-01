import argon2 from 'argon2';
import { STORAGE_PATHS } from '../storage/paths';
import { atomicWriteJson, fileExists, readJsonSafe } from '../storage/jsonStorageEngine';
import { SystemSettings, LuggageCategory } from '../types/settings';
import { AdminAccount } from '../types/admin';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { RawWbpRecord } from '../types/wbp';

export async function seedSettings(): Promise<void> {
  if (fileExists(STORAGE_PATHS.SETTINGS_FILE)) return;

  const defaultSettings: SystemSettings = {
    appTitle: 'SIKUNJUNG',
    agencyName: 'Lembaga Pemasyarakatan Kelas IIB Purwakarta',
    regionalOffice: 'KANTOR WILAYAH DIREKTORAT JENDERAL PEMASYARAKATAN JAWA BARAT',
    ministry: 'KEMENTERIAN IMIGRASI DAN PEMASYARAKATAN REPUBLIK INDONESIA',
    address: 'JL. MR. DR. Kusuma Atmaja No. 14, Cipaisan, Purwakarta, Cipaisan, Kec. Purwakarta, Kabupaten Purwakarta, Jawa Barat 41114',
    phone: '(0264) 200045',
    maxDailyRegistrations: 40,
    maxDailyVisitors: 60,
    openDays: [1, 2, 3, 4, 6],
    closedDays: [5, 7],
    closedSpecialDates: [],
    visitingHoursWeekday: {
      session1: { start: '08:30', end: '11:30' },
      session2: { start: '13:00', end: '14:30' }
    },
    visitingHoursSaturday: {
      session1: { start: '08:30', end: '11:30' }
    },
    ticketCustomNotes: 'Bawalah tiket ini dan KTP asli saat memasuki ruang kunjungan.',
    proofCustomNotes: 'Nomor antrean resmi diterbitkan saat verifikasi fisik di Lapas Purwakarta.',
    welcomeGreetingText: 'Selamat Datang di Layanan Pendaftaran Kunjungan Online Lapas Kelas IIB Purwakarta.',
    showCellLocationToPublic: false,
    defaultVisitDurationMinutes: 30
  };

  await atomicWriteJson(STORAGE_PATHS.SETTINGS_FILE, defaultSettings);
  logger.info('Seed settings default berhasil disimpan.');
}

export async function seedLuggageItems(): Promise<void> {
  if (fileExists(STORAGE_PATHS.ITEMS_FILE)) return;

  const defaultItems: LuggageCategory[] = [
    {
      id: 'ITM-001',
      name: 'Makanan Matang / Nasi Lauk',
      unit: 'Bungkus',
      maxQuantity: 3,
      isCurrency: false,
      active: true
    },
    {
      id: 'ITM-002',
      name: 'Pakaian Ganti',
      unit: 'Potong',
      maxQuantity: 3,
      isCurrency: false,
      active: true
    },
    {
      id: 'ITM-003',
      name: 'Obat-obatan (Resep Dokter)',
      unit: 'Paket',
      maxQuantity: 1,
      isCurrency: false,
      active: true
    },
    {
      id: 'ITM-004',
      name: 'Uang Titipan',
      unit: 'Rupiah',
      maxQuantity: 200000,
      isCurrency: true,
      active: true
    }
  ];

  await atomicWriteJson(STORAGE_PATHS.ITEMS_FILE, defaultItems);
  logger.info('Seed items barang bawaan berhasil disimpan.');
}

export async function seedAdminMaster(): Promise<void> {
  const existingAdmins = await readJsonSafe<AdminAccount[]>(STORAGE_PATHS.ADMINS_FILE, []);

  const masterExists = existingAdmins.some((a) => a.role === 'MASTER');
  if (masterExists) return;

  const passwordHash = await argon2.hash(env.ADMIN_MASTER_INITIAL_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1
  });

  const masterAccount: AdminAccount = {
    id: 'master-001',
    username: env.ADMIN_MASTER_USERNAME,
    role: 'MASTER',
    passwordHash,
    createdAt: new Date().toISOString(),
    mustChangePassword: true
  };

  existingAdmins.push(masterAccount);
  await atomicWriteJson(STORAGE_PATHS.ADMINS_FILE, existingAdmins);
  logger.info({ username: env.ADMIN_MASTER_USERNAME }, 'Akun Master awal berhasil diinisialisasi.');
}

export async function seedInitialWbpData(): Promise<void> {
  if (fileExists(STORAGE_PATHS.WBP_DATA_FILE)) return;

  const sampleWbp: RawWbpRecord[] = [
    {
      No: 1,
      'No Reg Instansi': 'B III 36/026',
      Nama: 'TATANG BIN TEDI',
      'Tanggal Lahir': '1978-09-21',
      Usia: 48,
      'Tanggal Masuk': '2024-12-19',
      'Lokasi Sel': 'TP Umum LT 1/A.04',
      'Putus Sidang': 'Sudah',
      'Jenis WBP': 'Narapidana',
      'Boleh Dikunjungi': 'Boleh Dikunjungi'
    },
    {
      No: 2,
      'No Reg Instansi': 'B I 274/024',
      Nama: 'ILHAM SUSANTO BIN OCAN',
      'Tanggal Lahir': '1981-08-16',
      Usia: 45,
      'Tanggal Masuk': '2024-12-19',
      'Lokasi Sel': 'TP Umum LT 1/B.02',
      'Putus Sidang': 'Sudah',
      'Jenis WBP': 'Narapidana',
      'Boleh Dikunjungi': 'Boleh Dikunjungi'
    },
    {
      No: 3,
      'No Reg Instansi': 'B I 287/024',
      Nama: 'ARIA FATULAESA BIN JAENUDIN',
      'Tanggal Lahir': '1984-07-15',
      Usia: 42,
      'Tanggal Masuk': '2024-12-19',
      'Lokasi Sel': 'TP Umum LT 1/A.04',
      'Putus Sidang': 'Sudah',
      'Jenis WBP': 'Narapidana',
      'Boleh Dikunjungi': 'Boleh Dikunjungi'
    },
    {
      No: 4,
      'No Reg Instansi': 'BI 49/025',
      Nama: 'SADDAM HUSEN BIN NURYADIN',
      'Tanggal Lahir': '1991-10-28',
      Usia: 35,
      'Tanggal Masuk': '2025-02-06',
      'Lokasi Sel': 'TP Umum LT 1/B.02',
      'Putus Sidang': 'Sudah',
      'Jenis WBP': 'Narapidana',
      'Boleh Dikunjungi': 'Boleh Dikunjungi'
    },
    {
      No: 5,
      'No Reg Instansi': 'B III 56/025',
      Nama: 'ZAYADI NUR',
      'Tanggal Lahir': '1963-03-02',
      Usia: 63,
      'Tanggal Masuk': '2024-12-19',
      'Lokasi Sel': 'TP Umum LT 1/A.09',
      'Putus Sidang': 'Sudah',
      'Jenis WBP': 'Narapidana',
      'Boleh Dikunjungi': 'Boleh Dikunjungi'
    }
  ];

  await atomicWriteJson(STORAGE_PATHS.WBP_DATA_FILE, sampleWbp);
  logger.info('Sample WBP Purwakarta berhasil diinisialisasi.');
}

export async function bootstrapSystem(): Promise<void> {
  await seedSettings();
  await seedLuggageItems();
  await seedAdminMaster();
  await seedInitialWbpData();
}
