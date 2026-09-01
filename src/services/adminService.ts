import argon2 from 'argon2';
import crypto from 'crypto';
import { STORAGE_PATHS } from '../storage/paths';
import { atomicWriteJson, readJsonSafe } from '../storage/jsonStorageEngine';
import { withGlobalLock } from '../storage/fileLockManager';
import { AdminAccount, AdminRole, PendingPasswordReset } from '../types/admin';
import { APP_CONFIG } from '../config/appConfig';
import { getNowInJakarta } from '../utils/dateUtils';
import { logger, writeAuditLog } from '../utils/logger';

export function validatePasswordPolicy(password: string): { valid: boolean; reason?: string } {
  if (password.length < APP_CONFIG.PASSWORD_POLICY.minLength) {
    return {
      valid: false,
      reason: `Password minimal ${APP_CONFIG.PASSWORD_POLICY.minLength} karakter.`
    };
  }

  if (password.length > APP_CONFIG.PASSWORD_POLICY.maxLength) {
    return {
      valid: false,
      reason: `Password maksimal ${APP_CONFIG.PASSWORD_POLICY.maxLength} karakter.`
    };
  }

  if (APP_CONFIG.PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password harus mengandung minimal 1 huruf besar (A-Z).' };
  }

  if (APP_CONFIG.PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    return { valid: false, reason: 'Password harus mengandung minimal 1 huruf kecil (a-z).' };
  }

  if (APP_CONFIG.PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password harus mengandung minimal 1 angka (0-9).' };
  }

  if (APP_CONFIG.PASSWORD_POLICY.requireSymbol && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, reason: 'Password harus mengandung minimal 1 karakter simbol (!@#$%^&*).' };
  }

  return { valid: true };
}

export async function hashPassword(plainText: string): Promise<string> {
  return await argon2.hash(plainText, {
    type: argon2.argon2id
  });
}

export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainText);
  } catch (err) {
    logger.warn({ err }, 'Error saat memverifikasi argon2 hash');
    return false;
  }
}

// Hash dummy dengan parameter Argon2id yang sama seperti akun asli. Dipakai
// saat username tidak ditemukan agar waktu respons login tidak membocorkan
// keberadaan akun (user enumeration melalui timing).
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$CbVq2wGf4SVw9wQis05U5w$DENWpu8ZNJyffOV4ckjmUo48Ix+PUaUqCkx1xCQj24I';

export async function verifyDummyPassword(plainText: string): Promise<void> {
  await verifyPassword(DUMMY_PASSWORD_HASH, plainText);
}

export async function getAllAdmins(): Promise<AdminAccount[]> {
  return await readJsonSafe<AdminAccount[]>(STORAGE_PATHS.ADMINS_FILE, []);
}

export async function getAdminByUsername(username: string): Promise<AdminAccount | null> {
  const admins = await getAllAdmins();
  return admins.find((a) => a.username.toLowerCase() === username.trim().toLowerCase()) ?? null;
}

export async function createAdmin(
  input: { username: string; role: AdminRole; plainPassword: string },
  createdBy: string
): Promise<AdminAccount> {
  const cleanUsername = input.username.trim().toLowerCase();

  const policyCheck = validatePasswordPolicy(input.plainPassword);
  if (!policyCheck.valid) {
    throw new Error(policyCheck.reason);
  }

  return await withGlobalLock('config_admins', async () => {
    const admins = await getAllAdmins();
    if (admins.some((a) => a.username.toLowerCase() === cleanUsername)) {
      throw new Error(`Username "${cleanUsername}" sudah digunakan.`);
    }

    const passwordHash = await hashPassword(input.plainPassword);
    const nowIso = getNowInJakarta().toISO() ?? new Date().toISOString();

    const newAdmin: AdminAccount = {
      id: crypto.randomUUID(),
      username: cleanUsername,
      role: input.role,
      passwordHash,
      createdAt: nowIso,
      mustChangePassword: false,
      sessionVersion: 0
    };

    admins.push(newAdmin);
    await atomicWriteJson(STORAGE_PATHS.ADMINS_FILE, admins);

    writeAuditLog({
      action: 'ADMIN_CREATED',
      actor: createdBy,
      details: { username: cleanUsername, role: input.role }
    });

    return newAdmin;
  });
}

export async function deleteAdmin(adminId: string, deletedBy: string): Promise<void> {
  await withGlobalLock('config_admins', async () => {
    const admins = await getAllAdmins();
    const target = admins.find((a) => a.id === adminId);

    if (!target) {
      throw new Error('Akun admin tidak ditemukan.');
    }

    if (target.role === 'MASTER') {
      const masterCount = admins.filter((a) => a.role === 'MASTER').length;
      if (masterCount <= 1) {
        throw new Error('Akun Master terakhir tidak boleh dihapus.');
      }
    }

    const updated = admins.filter((a) => a.id !== adminId);
    await atomicWriteJson(STORAGE_PATHS.ADMINS_FILE, updated);

    writeAuditLog({
      action: 'ADMIN_DELETED',
      actor: deletedBy,
      details: { username: target.username, role: target.role }
    });
  });
}

export async function updateAdminPassword(
  adminId: string,
  newPlainPassword: string,
  updatedBy: string
): Promise<number> {
  const policyCheck = validatePasswordPolicy(newPlainPassword);
  if (!policyCheck.valid) {
    throw new Error(policyCheck.reason);
  }

  return await withGlobalLock('config_admins', async () => {
    const admins = await getAllAdmins();
    const admin = admins.find((a) => a.id === adminId);

    if (!admin) {
      throw new Error('Akun admin tidak ditemukan.');
    }

    admin.passwordHash = await hashPassword(newPlainPassword);
    admin.mustChangePassword = false;
    admin.sessionVersion = (admin.sessionVersion ?? 0) + 1;

    await atomicWriteJson(STORAGE_PATHS.ADMINS_FILE, admins);

    writeAuditLog({
      action: 'ADMIN_PASSWORD_UPDATED',
      actor: updatedBy,
      details: { username: admin.username }
    });

    return admin.sessionVersion;
  });
}

export async function updateLastLogin(adminId: string): Promise<void> {
  await withGlobalLock('config_admins', async () => {
    const admins = await getAllAdmins();
    const admin = admins.find((a) => a.id === adminId);
    if (admin) {
      admin.lastLoginAt = getNowInJakarta().toISO() ?? new Date().toISOString();
      await atomicWriteJson(STORAGE_PATHS.ADMINS_FILE, admins);
    }
  });
}

// --- PASSWORD RESET MANAGEMENT (BR-17) ---

export async function getPendingResets(): Promise<PendingPasswordReset[]> {
  return await readJsonSafe<PendingPasswordReset[]>(STORAGE_PATHS.PENDING_RESETS_FILE, []);
}

export async function requestPasswordReset(username: string): Promise<PendingPasswordReset> {
  const cleanUsername = username.trim().toLowerCase();
  const admin = await getAdminByUsername(cleanUsername);

  if (!admin) {
    throw new Error(`Username "${cleanUsername}" tidak terdaftar sebagai petugas.`);
  }

  return await withGlobalLock('pending_resets', async () => {
    const resets = await getPendingResets();

    // Cek jika sudah ada pending reset aktif
    const existing = resets.find((r) => r.username === cleanUsername && r.status === 'PENDING');
    if (existing) {
      return existing;
    }

    const newReset: PendingPasswordReset = {
      id: crypto.randomUUID(),
      username: cleanUsername,
      requestedAt: getNowInJakarta().toISO() ?? new Date().toISOString(),
      status: 'PENDING'
    };

    resets.push(newReset);
    await atomicWriteJson(STORAGE_PATHS.PENDING_RESETS_FILE, resets);

    writeAuditLog({
      action: 'PASSWORD_RESET_REQUESTED',
      actor: cleanUsername,
      details: { username: cleanUsername }
    });

    return newReset;
  });
}

function generateTemporaryPassword(): string {
  // 12 byte acak = 96 bit entropi, jauh lebih kuat daripada 4 byte.
  const rand = crypto.randomBytes(12).toString('base64url');
  return `Purwa@${rand}!9`;
}

export async function approvePasswordReset(
  resetId: string,
  approvedBy: string
): Promise<{ tempPassword: string; admin: AdminAccount }> {
  return await withGlobalLock('pending_resets', async () => {
    const resets = await getPendingResets();
    const target = resets.find((r) => r.id === resetId && r.status === 'PENDING');

    if (!target) {
      throw new Error('Permintaan reset password tidak ditemukan atau sudah diproses.');
    }

    const admins = await getAllAdmins();
    const admin = admins.find((a) => a.username === target.username);

    if (!admin) {
      throw new Error(`Akun admin ${target.username} tidak ditemukan.`);
    }

    const tempPassword = generateTemporaryPassword();
    admin.passwordHash = await hashPassword(tempPassword);
    admin.mustChangePassword = true;
    admin.sessionVersion = (admin.sessionVersion ?? 0) + 1;

    target.status = 'APPROVED';
    target.approvedAt = getNowInJakarta().toISO() ?? new Date().toISOString();
    target.approvedBy = approvedBy;

    await atomicWriteJson(STORAGE_PATHS.ADMINS_FILE, admins);
    await atomicWriteJson(STORAGE_PATHS.PENDING_RESETS_FILE, resets);

    writeAuditLog({
      action: 'PASSWORD_RESET_APPROVED',
      actor: approvedBy,
      details: { username: admin.username }
    });

    return { tempPassword, admin };
  });
}

export async function rejectPasswordReset(resetId: string, rejectedBy: string): Promise<void> {
  await withGlobalLock('pending_resets', async () => {
    const resets = await getPendingResets();
    const target = resets.find((r) => r.id === resetId && r.status === 'PENDING');

    if (!target) {
      throw new Error('Permintaan reset password tidak ditemukan.');
    }

    target.status = 'REJECTED';
    await atomicWriteJson(STORAGE_PATHS.PENDING_RESETS_FILE, resets);

    writeAuditLog({
      action: 'PASSWORD_RESET_REJECTED',
      actor: rejectedBy,
      details: { username: target.username }
    });
  });
}
