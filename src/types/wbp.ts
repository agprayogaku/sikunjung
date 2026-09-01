export type PutusSidang = 'Sudah' | 'Belum';
export type WbpType = 'Narapidana' | 'Tahanan';
export type BolehDikunjungi = 'Boleh Dikunjungi' | 'Hanya Titipan Barang' | 'Tidak Boleh Dikunjungi';

export interface RawWbpRecord {
  No?: number;
  'No Reg Instansi': string;
  Nama: string;
  'Tanggal Lahir': string;
  Usia?: number;
  'Tanggal Masuk': string;
  'Lokasi Sel': string;
  'Putus Sidang': string;
  'Jenis WBP'?: string;
  'Boleh Dikunjungi'?: string;
}

export interface WbpRecord {
  no: number;
  wbpId: string;
  noRegInstansi: string;
  nama: string;
  tanggalLahir: string;
  usia: number;
  tanggalMasuk: string;
  lokasiSel: string;
  putusSidang: PutusSidang;
  jenisWbp: WbpType;
  bolehDikunjungi: BolehDikunjungi;
}

export interface WbpPublicSnapshot {
  wbpId: string;
  nama: string;
  tanggalLahir: string;
  usia: number;
  tanggalMasuk: string;
  putusSidang: PutusSidang;
  jenisWbp: WbpType;
  bolehDikunjungi: BolehDikunjungi;
}
