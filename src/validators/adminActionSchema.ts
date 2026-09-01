import { z } from 'zod';
import { DateTime } from 'luxon';
import { APP_CONFIG } from '../config/appConfig';

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .refine(
    (value) =>
      DateTime.fromFormat(value, 'yyyy-MM-dd', { zone: APP_CONFIG.TIMEZONE }).isValid,
    'Tanggal tidak valid'
  );

export const AdminDateSchema = dateSchema;

export const RegistrationStatusSchema = z.enum([
  'MENUNGGU VERIFIKASI',
  'HADIR TERVERIFIKASI',
  'DIPANGGIL',
  'SEDANG BERKUNJUNG',
  'SELESAI',
  'TIDAK HADIR',
  'DITOLAK',
  'DIBATALKAN'
]);

export const QueueStatusSchema = z.enum([
  'MENUNGGU DIPANGGIL',
  'DIPANGGIL',
  'SEDANG BERKUNJUNG',
  'SELESAI',
  'DILEWATI'
]);

export const WbpVisitingStatusSchema = z.enum([
  'Boleh Dikunjungi',
  'Hanya Titipan Barang',
  'Tidak Boleh Dikunjungi'
]);

export const AdminSettingsInputSchema = z
  .object({
    agencyName: z.string().trim().min(1, 'Nama instansi wajib diisi').max(150),
    regionalOffice: z.string().trim().min(1, 'Kantor wilayah wajib diisi').max(150),
    ministry: z.string().trim().min(1, 'Nama kementerian wajib diisi').max(150),
    address: z.string().trim().min(1, 'Alamat wajib diisi').max(255),
    phone: z.string().trim().min(1, 'Telepon wajib diisi').max(30),
    maxDailyRegistrations: z.coerce
      .number()
      .int('Kuota pendaftaran harus bilangan bulat')
      .min(1, 'Kuota pendaftaran minimal 1')
      .max(200, 'Kuota pendaftaran maksimal 200'),
    maxDailyVisitors: z.coerce
      .number()
      .int('Kuota pengunjung harus bilangan bulat')
      .min(1, 'Kuota pengunjung minimal 1')
      .max(500, 'Kuota pengunjung maksimal 500'),
    ticketCustomNotes: z.string().trim().max(1000, 'Catatan tiket maksimal 1000 karakter').default(''),
    proofCustomNotes: z.string().trim().max(1000, 'Catatan bukti maksimal 1000 karakter').default(''),
    closedSpecialDates: z.array(dateSchema).max(366, 'Tanggal tutup terlalu banyak')
  })
  .refine((data) => data.maxDailyVisitors >= data.maxDailyRegistrations, {
    message: 'Kuota pengunjung tidak boleh lebih kecil dari kuota pendaftaran',
    path: ['maxDailyVisitors']
  });

export const LuggageCategoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Nama kategori wajib diisi').max(100),
  unit: z.string().trim().min(1, 'Satuan wajib diisi').max(30),
  maxQuantity: z.coerce
    .number()
    .int('Batas kuantitas harus bilangan bulat')
    .min(1, 'Batas kuantitas minimal 1')
    .max(100_000_000, 'Batas kuantitas terlalu besar'),
  isCurrency: z.boolean().default(false)
});

export function parseAdminDate(value: unknown, fallback: string): string {
  const parsed = AdminDateSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Data yang dikirim tidak valid.';
}
