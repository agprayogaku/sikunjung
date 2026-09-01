import { AdminRole } from '../../types/admin';

declare module 'express-session' {
  interface SessionData {
    adminUser?: {
      id: string;
      username: string;
      role: AdminRole;
      mustChangePassword?: boolean;
      sessionVersion?: number;
    };
    flashTempPassword?: {
      username: string;
      password: string;
    };
  }
}
