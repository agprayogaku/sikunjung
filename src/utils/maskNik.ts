export function maskNik(nik: string): string {
  if (!nik || typeof nik !== 'string') return '';
  const clean = nik.trim();
  if (clean.length < 8) return clean;
  const prefix = clean.slice(0, 4);
  const suffix = clean.slice(-4);
  const stars = '*'.repeat(Math.max(0, clean.length - 8));
  return `${prefix}${stars}${suffix}`;
}
