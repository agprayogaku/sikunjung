import { z } from 'zod';
import { RawWbpRecord } from '../types/wbp';

export const RawWbpItemSchema = z.object({
  No: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).optional(),
  'No Reg Instansi': z.string().min(1, 'No Reg Instansi wajib diisi').transform((v) => v.trim()),
  Nama: z.string().min(1, 'Nama WBP wajib diisi').transform((v) => v.trim().toUpperCase()),
  'Tanggal Lahir': z
    .string()
    .min(1, 'Tanggal Lahir wajib diisi')
    .transform((v) => v.trim())
    .refine((v) => !isNaN(Date.parse(v)), { message: 'Format Tanggal Lahir tidak valid' }),
  Usia: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).optional(),
  'Tanggal Masuk': z
    .string()
    .min(1, 'Tanggal Masuk wajib diisi')
    .transform((v) => v.trim())
    .refine((v) => !isNaN(Date.parse(v)), { message: 'Format Tanggal Masuk tidak valid' }),
  'Lokasi Sel': z.string().min(1, 'Lokasi Sel wajib diisi').transform((v) => v.trim()),
  'Putus Sidang': z
    .string()
    .transform((v) => v.trim())
    .refine(
      (v) => ['sudah', 'belum'].includes(v.toLowerCase()),
      { message: 'Putus Sidang harus "Sudah" atau "Belum"' }
    )
    .transform((v) => (v.toLowerCase() === 'sudah' ? 'Sudah' : 'Belum') as 'Sudah' | 'Belum'),
  'Jenis WBP': z
    .enum(['Narapidana', 'Tahanan'])
    .optional(),
  'Boleh Dikunjungi': z
    .enum(['Boleh Dikunjungi', 'Hanya Titipan Barang', 'Tidak Boleh Dikunjungi'])
    .optional()
    .default('Boleh Dikunjungi')
});

export const WbpUploadArraySchema = z
  .array(RawWbpItemSchema)
  .min(1, 'Array data WBP tidak boleh kosong');

export function validateWbpUploadData(data: unknown): RawWbpRecord[] {
  const parsed = WbpUploadArraySchema.safeParse(data);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .slice(0, 5)
      .map((i) => `[Item ${i.path.join('.')}]: ${i.message}`)
      .join('; ');
    throw new Error(`Validasi JSON WBP gagal: ${errorDetails}`);
  }
  return parsed.data as RawWbpRecord[];
}
