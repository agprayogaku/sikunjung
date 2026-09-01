export type AdminRole = 'MASTER' | 'ADMIN';

export interface AdminAccount {
  id: string;
  username: string;
  role: AdminRole;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
  mustChangePassword?: boolean;
  sessionVersion?: number;
}

export interface PendingPasswordReset {
  id: string;
  username: string;
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedAt?: string;
  approvedBy?: string;
}
