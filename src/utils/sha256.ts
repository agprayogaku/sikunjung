import crypto from 'crypto';

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function computeWbpDeterministicId(noRegInstansi: string, nama: string, tanggalLahir: string): string {
  const normalized = `${noRegInstansi.trim().toLowerCase()}|${nama.trim().toLowerCase()}|${tanggalLahir.trim()}`;
  return sha256(normalized);
}

export function generateVerifyToken(length = 16): string {
  return crypto.randomBytes(length).toString('hex');
}
