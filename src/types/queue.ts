export type QueueStatus =
  | 'MENUNGGU DIPANGGIL'
  | 'DIPANGGIL'
  | 'SEDANG BERKUNJUNG'
  | 'SELESAI'
  | 'DILEWATI';

export interface QueueEntry {
  queueNumber: string; // e.g. "A 001"
  sequence: number; // 1, 2, ...
  regNumber: string; // REG YYYYMMDD XXXXXX
  wbpName: string;
  primaryName: string;
  totalVisitors: number;
  verifiedAt: string;
  status: QueueStatus;
  statusHistory: Array<{
    status: QueueStatus;
    changedAt: string;
  }>;
}

export interface DailyQueueFile {
  visitDate: string;
  lastNumber: number;
  entries: QueueEntry[];
}
