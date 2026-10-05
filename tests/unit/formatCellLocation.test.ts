import { formatCellLocation } from '../../src/utils/formatCellLocation';

describe('formatCellLocation', () => {
  it('mengambil segmen terakhir setelah garis miring', () => {
    expect(formatCellLocation('TP Umum LT 1/A.04')).toBe('A.04');
    expect(formatCellLocation('TP Umum LT 1/B.02')).toBe('B.02');
  });

  it('membersihkan spasi di sekitar segmen', () => {
    expect(formatCellLocation(' TP Umum LT 1 / A.04 / ')).toBe('A.04');
  });

  it('mempertahankan nilai yang tidak memiliki garis miring', () => {
    expect(formatCellLocation('Blok C.01')).toBe('Blok C.01');
    expect(formatCellLocation('A.04')).toBe('A.04');
  });

  it('memakai fallback untuk nilai kosong atau tidak valid', () => {
    expect(formatCellLocation('')).toBe('-');
    expect(formatCellLocation('   ')).toBe('-');
    expect(formatCellLocation('///')).toBe('-');
    expect(formatCellLocation(null)).toBe('-');
    expect(formatCellLocation(undefined)).toBe('-');
  });

  it('mendukung fallback kustom', () => {
    expect(formatCellLocation(null, '-')).toBe('-');
    expect(formatCellLocation('', 'Belum ditentukan')).toBe('Belum ditentukan');
  });
});
