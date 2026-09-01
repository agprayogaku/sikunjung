import { Request, Response } from 'express';
import crypto from 'crypto';
import { getLuggageCategories, getSettings } from '../services/settingsService';
import { CreateRegistrationInputSchema } from '../validators/registrationSchema';
import {
  cancelRegistration,
  createRegistration,
  getRegistrationByNumber
} from '../services/registrationService';
import { generateRegistrationProofA6 } from '../services/pdfService';
import { logger } from '../utils/logger';

function safeEquals(left: string, right: string): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidNik(value: string): boolean {
  return /^\d{16}$/.test(value);
}

export async function renderHome(_req: Request, res: Response): Promise<void> {
  res.render('public/index');
}

export async function renderRegister(_req: Request, res: Response): Promise<void> {
  const categories = await getLuggageCategories();
  const activeCategories = categories.filter((c) => c.active);
  res.render('public/register', { categories: activeCategories, error: null });
}

export async function handleRegisterSubmit(req: Request, res: Response): Promise<void> {
  const categories = await getLuggageCategories();
  const activeCategories = categories.filter((c) => c.active);

  try {
    const rawBody = req.body;

    // Normalisasi followers dari form array (req.body.followers bisa berupa object/array)
    let followers: any[] = [];
    if (rawBody.followers) {
      if (Array.isArray(rawBody.followers)) {
        followers = rawBody.followers;
      } else if (typeof rawBody.followers === 'object') {
        followers = Object.values(rawBody.followers);
      }
    }

    // Normalisasi luggage dari form
    let luggageItems: any[] = [];
    if (rawBody.luggage) {
      const rawLuggageList = Array.isArray(rawBody.luggage)
        ? rawBody.luggage
        : Object.values(rawBody.luggage);

      luggageItems = rawLuggageList
        .map((item: any) => ({
          itemId: item.itemId,
          itemName: item.itemName,
          unit: item.unit,
          quantity: Number(item.quantity || 0),
          notes: item.notes ? String(item.notes).trim() : undefined
        }))
        .filter((item: any) => item.quantity > 0);
    }

    const payload = {
      wbpId: rawBody.wbpId,
      visitDate: rawBody.visitDate,
      primaryVisitor: {
        nik: rawBody.primaryNik,
        nama: rawBody.primaryNama,
        jenisKelamin: rawBody.primaryJenisKelamin,
        relasi: rawBody.primaryRelasi,
        alamat: rawBody.primaryAlamat,
        telepon: rawBody.primaryTelepon
      },
      adultFollowers: followers.map((f: any) => ({
        nik: f.nik,
        nama: f.nama,
        jenisKelamin: f.jenisKelamin,
        relasi: f.relasi,
        alamat: f.alamat
      })),
      childrenCount: Number(rawBody.childrenCount || 0),
      luggageItems
    };

    const parsed = CreateRegistrationInputSchema.safeParse(payload);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(' | ');
      res.render('public/register', { categories: activeCategories, error: errorMsg });
      return;
    }

    const record = await createRegistration(parsed.data);
    res.redirect(
      `/daftar/sukses?reg=${encodeURIComponent(record.registrationNumber)}&token=${encodeURIComponent(
        record.verifyToken
      )}`
    );
  } catch (err: any) {
    logger.warn({ err }, 'Gagal submit pendaftaran');
    res.render('public/register', {
      categories: activeCategories,
      error: err.message || 'Terjadi kesalahan sistem saat memproses pendaftaran.'
    });
  }
}

export async function renderRegisterSuccess(req: Request, res: Response): Promise<void> {
  const regNumber = typeof req.query.reg === 'string' ? req.query.reg.trim() : '';
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!regNumber || !token) {
    res.redirect('/');
    return;
  }

  const record = await getRegistrationByNumber(regNumber);
  if (!record || !safeEquals(record.verifyToken, token)) {
    res.redirect('/');
    return;
  }

  res.set('Cache-Control', 'no-store, private');
  res.render('public/registerSuccess', { record });
}

export async function downloadProofPdf(req: Request, res: Response): Promise<void> {
  const regNumber = req.params.regNumber?.trim() ?? '';
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!regNumber) {
    res.status(400).send('Nomor registrasi tidak valid.');
    return;
  }

  const record = await getRegistrationByNumber(regNumber);
  const authorized = record !== null && token.length > 0 && safeEquals(record.verifyToken, token);

  if (!record || !authorized) {
    res.status(404).send('Data pendaftaran tidak ditemukan.');
    return;
  }

  try {
    const settings = await getSettings();
    const pdfBuffer = await generateRegistrationProofA6(record, settings);

    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Bukti_Pendaftaran_${record.registrationNumber}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    logger.error({ err, regNumber }, 'Gagal men-generate bukti PDF');
    res.status(500).send('Terjadi kesalahan saat membuat file PDF bukti pendaftaran.');
  }
}

export async function renderStatus(req: Request, res: Response): Promise<void> {
  const queryReg = typeof req.query.reg === 'string' ? req.query.reg.trim() : '';
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const successType = req.query.success;

  let record = null;
  let successMessage = null;
  let error = null;

  if (successType === 'cancelled') {
    successMessage = 'Pendaftaran kunjungan telah berhasil dibatalkan. Kuota WBP telah dibebaskan kembali.';
  }

  // Status detail hanya ditampilkan jika pengunjung membawa token kapabilitas
  // dari halaman sukses/PDF. NIK tidak pernah ditaruh di URL.
  if (queryReg && token) {
    const found = await getRegistrationByNumber(queryReg);
    if (!found || !safeEquals(found.verifyToken, token)) {
      error = 'Nomor registrasi atau token akses tidak cocok.';
    } else {
      record = found;
    }
  }

  res.set('Cache-Control', 'no-store, private');
  res.render('public/status', {
    queryReg,
    queryNik: '',
    record,
    pdfToken: record?.verifyToken ?? null,
    successMessage,
    error
  });
}

export async function handleStatusLookup(req: Request, res: Response): Promise<void> {
  const regNumber = typeof req.body.reg === 'string' ? req.body.reg.trim() : '';
  const nik = typeof req.body.nik === 'string' ? req.body.nik.trim() : '';

  let error = null;
  if (!isValidNik(nik)) {
    error = 'Masukkan NIK pendaftar utama (16 digit) untuk melihat status pendaftaran.';
  } else {
    const found = await getRegistrationByNumber(regNumber);
    if (!found || !safeEquals(found.primaryVisitor.nik, nik)) {
      error = 'Nomor registrasi atau NIK tidak cocok.';
    } else {
      res.redirect(
        `/status?reg=${encodeURIComponent(regNumber)}&token=${encodeURIComponent(found.verifyToken)}`
      );
      return;
    }
  }

  res.set('Cache-Control', 'no-store, private');
  res.render('public/status', {
    queryReg: regNumber,
    queryNik: '',
    record: null,
    pdfToken: null,
    successMessage: null,
    error
  });
}

export async function handlePublicCancel(req: Request, res: Response): Promise<void> {
  const regNumber = typeof req.body.regNumber === 'string' ? req.body.regNumber.trim() : '';
  const nik = typeof req.body.nik === 'string' ? req.body.nik.trim() : '';
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

  try {
    const cancelled = await cancelRegistration(regNumber, nik, reason, 'Pengunjung (Mandiri)');
    res.redirect(
      `/status?reg=${encodeURIComponent(regNumber)}&token=${encodeURIComponent(
        cancelled.verifyToken
      )}&success=cancelled`
    );
  } catch (err: any) {
    logger.warn({ err, regNumber }, 'Gagal membatalkan pendaftaran publik');
    res.set('Cache-Control', 'no-store, private');
    res.render('public/status', {
      queryReg: regNumber,
      queryNik: '',
      record: null,
      pdfToken: null,
      successMessage: null,
      error: err.message || 'Gagal membatalkan pendaftaran.'
    });
  }
}
