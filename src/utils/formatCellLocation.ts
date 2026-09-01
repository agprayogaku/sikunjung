export function formatCellLocation(
  value: string | null | undefined,
  fallback = '-'
): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  // Lokasi sel sering berbentuk "TP Umum LT 1/A.04".
  // Untuk tampilan, ambil segmen terakhir setelah garis miring.
  const segments = trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return fallback;
  }

  return segments[segments.length - 1] ?? fallback;
}
