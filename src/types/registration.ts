import { WbpPublicSnapshot } from './wbp';

export type RegistrationStatus =
  | 'MENUNGGU VERIFIKASI'
  | 'HADIR TERVERIFIKASI'
  | 'DIPANGGIL'
  | 'SEDANG BERKUNJUNG'
  | 'SELESAI'
  | 'TIDAK HADIR'
  | 'DITOLAK'
  | 'DIBATALKAN';

export interface PrimaryVisitor {
  nik: string;
  nama: string;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  relasi: string;
  alamat: string;
  telepon: string;
}

export interface AdultFollower {
  nik: string;
  nama: string;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  relasi: string;
  alamat: string;
}

export interface LuggageItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface QueueInfo {
  queueNumber?: string;
  queueSequence?: number;
  queueStatus?: string;
  verifiedAt?: string;
  verifiedBy?: string;
}

export interface StatusHistoryEntry {
  status: RegistrationStatus;
  changedAt: string;
  changedBy: string;
  reason?: string;
}

export interface RegistrationRecord {
  id: string; // uuid
  registrationNumber: string; // REG YYYYMMDD XXXXXX
  verifyToken: string;
  createdAt: string; // ISO
  visitDate: string; // YYYY-MM-DD
  status: RegistrationStatus;
  wbp: WbpPublicSnapshot & { lokasiSel?: string };
  primaryVisitor: PrimaryVisitor;
  adultFollowers: AdultFollower[];
  childrenCount: number;
  totalAdults: number;
  totalVisitors: number;
  luggageItems: LuggageItem[];
  queueInfo?: QueueInfo;
  statusHistory: StatusHistoryEntry[];
}

export interface DailyRegistrationFile {
  visitDate: string;
  updatedAt: string;
  guard: {
    activeWbp: string[];
    activeNiks: string[];
    capacityUsed: {
      registrations: number;
      visitors: number;
    };
  };
  records: RegistrationRecord[];
}
