import { Request, Response } from 'express';
import { getWbpById, searchWbp } from '../services/wbpService';
import { getAvailableDatesForWbp } from '../services/scheduleService';
import { getVisitorHistoryByNik } from '../services/nikHistoryService';

export async function searchWbpApi(req: Request, res: Response): Promise<void> {
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const results = await searchWbp(query, 25);
  res.json(results);
}

export async function availableDatesApi(req: Request, res: Response): Promise<void> {
  const wbpId = typeof req.query.wbpId === 'string' ? req.query.wbpId : '';
  if (!wbpId) {
    res.status(400).json({ error: 'Parameter wbpId wajib disertakan' });
    return;
  }

  const wbp = await getWbpById(wbpId);
  if (!wbp) {
    res.status(404).json({ error: 'WBP tidak ditemukan' });
    return;
  }

  const dates = await getAvailableDatesForWbp(wbp.jenisWbp);
  res.json(dates);
}

export async function nikLookupApi(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store, private');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  const nik = typeof req.query.nik === 'string' ? req.query.nik : '';
  if (!nik || !/^\d{16}$/.test(nik)) {
    res.json(null);
    return;
  }

  const history = await getVisitorHistoryByNik(nik);
  if (!history) {
    res.json(null);
    return;
  }

  // Jangan pernah mengirim alamat/telepon lengkap lewat endpoint publik.
  // Data sensitif hanya boleh diisi ulang manual oleh pemilik NIK.
  res.json({
    nama: history.nama,
    jenisKelamin: history.jenisKelamin,
    lastRelasi: history.lastRelasi,
    lastVisitDate: history.lastVisitDate,
    totalVisits: history.totalVisits
  });
}
