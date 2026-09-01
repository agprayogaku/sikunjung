import { z } from 'zod';

const nikRegex = /^\d{16}$/;
const phoneRegex = /^(\+62|62|08|0)[0-9]{7,15}$/;

export const PrimaryVisitorSchema = z.object({
  nik: z
    .string()
    .trim()
    .regex(nikRegex, 'NIK harus terdiri dari 16 digit angka'),
  nama: z
    .string()
    .trim()
    .min(2, 'Nama pengunjung minimal 2 karakter')
    .max(100, 'Nama pengunjung maksimal 100 karakter'),
  jenisKelamin: z.enum(['Laki-laki', 'Perempuan'], {
    errorMap: () => ({ message: 'Jenis kelamin harus Laki-laki atau Perempuan' })
  }),
  relasi: z
    .string()
    .trim()
    .min(2, 'Relasi/Hubungan keluarga wajib diisi')
    .max(50, 'Relasi maksimal 50 karakter'),
  alamat: z
    .string()
    .trim()
    .min(5, 'Alamat KTP minimal 5 karakter')
    .max(255, 'Alamat KTP maksimal 255 karakter'),
  telepon: z
    .string()
    .trim()
    .min(8, 'Nomor telepon tidak valid')
    .max(20, 'Nomor telepon maksimal 20 digit')
    .refine((v) => phoneRegex.test(v.replace(/[\s-]/g, '')), {
      message: 'Format nomor telepon tidak valid (contoh: 081234567890)'
    })
});

export const AdultFollowerSchema = z.object({
  nik: z
    .string()
    .trim()
    .regex(nikRegex, 'NIK pengikut harus terdiri dari 16 digit angka'),
  nama: z
    .string()
    .trim()
    .min(2, 'Nama pengikut minimal 2 karakter')
    .max(100, 'Nama pengikut maksimal 100 karakter'),
  jenisKelamin: z.enum(['Laki-laki', 'Perempuan'], {
    errorMap: () => ({ message: 'Jenis kelamin pengikut harus Laki-laki atau Perempuan' })
  }),
  relasi: z
    .string()
    .trim()
    .min(2, 'Relasi pengikut wajib diisi')
    .max(50, 'Relasi maksimal 50 karakter'),
  alamat: z
    .string()
    .trim()
    .min(5, 'Alamat pengikut minimal 5 karakter')
    .max(255, 'Alamat pengikut maksimal 255 karakter')
});

export const LuggageItemInputSchema = z.object({
  itemId: z.string().trim().min(1, 'ID barang wajib diisi'),
  itemName: z.string().trim().min(1, 'Nama barang wajib diisi'),
  quantity: z
    .union([z.number(), z.string().transform((v) => Number(v))])
    .refine((v) => !isNaN(v) && v > 0, { message: 'Jumlah barang harus lebih dari 0' }),
  unit: z.string().trim().min(1, 'Satuan wajib diisi'),
  notes: z.string().trim().max(255, 'Keterangan maksimal 255 karakter').optional()
});

export const CreateRegistrationInputSchema = z
  .object({
    wbpId: z.string().trim().min(1, 'ID WBP wajib dipilih'),
    visitDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal kunjungan harus YYYY-MM-DD'),
    primaryVisitor: PrimaryVisitorSchema,
    adultFollowers: z.array(AdultFollowerSchema).default([]),
    childrenCount: z
      .union([z.number(), z.string().transform((v) => Number(v))])
      .refine((v) => !isNaN(v) && v >= 0 && v <= 2, {
        message: 'Jumlah anak maksimal 2 orang (usia 0-14 tahun)'
      })
      .default(0),
    luggageItems: z.array(LuggageItemInputSchema).default([])
  })
  .superRefine((data, ctx) => {
    // 1. Validasi keunikan NIK dalam 1 rombongan
    const allNiks = [data.primaryVisitor.nik];
    for (let i = 0; i < data.adultFollowers.length; i++) {
      const f = data.adultFollowers[i];
      if (!f) continue;
      if (allNiks.includes(f.nik)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `NIK ${f.nik} duplikat di dalam rombongan pengunjung yang sama`,
          path: ['adultFollowers', i, 'nik']
        });
      }
      allNiks.push(f.nik);
    }

    // 2. Validasi Kuota Rombongan (BR-04)
    // - Maks 4 dewasa (0 anak)
    // - Maks 3 dewasa (1-2 anak)
    const totalAdults = 1 + data.adultFollowers.length;
    const children = data.childrenCount;

    if (children === 0 && totalAdults > 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Batas maksimal pengunjung dewasa tanpa anak adalah 4 orang (1 pendaftar utama + 3 pengikut)',
        path: ['adultFollowers']
      });
    }

    if (children > 0 && totalAdults > 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Jika membawa ${children} anak, batas maksimal dewasa adalah 3 orang (1 pendaftar utama + 2 pengikut)`,
        path: ['adultFollowers']
      });
    }
  });

export type CreateRegistrationInput = z.infer<typeof CreateRegistrationInputSchema>;
