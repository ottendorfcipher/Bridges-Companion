import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '@config/firebase';
import type { QueryResult } from '@/types/database';
import type { User } from '@/types/user';

export interface SecurityConfig {
  lockdownEnabled: boolean;
  allowlistEmails: string[];
  allowlistUids: string[];
  ownerUid?: string;
  updatedAt?: string;
  updatedByUid?: string;
  updatedByEmail?: string;
}

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  lockdownEnabled: false,
  allowlistEmails: [],
  allowlistUids: [],
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).filter(Boolean);
}

export function isUserWhitelisted(user: User, config: SecurityConfig): boolean {
  // Admins are always allowed, regardless of allowlist contents.
  if (user.role === 'admin' && user.status === 'active') return true;

  const email = user.email ? normalizeEmail(user.email) : null;
  if (email && config.allowlistEmails.map(normalizeEmail).includes(email)) return true;
  if (config.allowlistUids.includes(user.uid)) return true;
  return false;
}

export async function getSecurityConfig(): Promise<QueryResult<SecurityConfig>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const ref = doc(firestore, 'appConfig', 'securityConfig');
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return { success: true, data: { ...DEFAULT_SECURITY_CONFIG } };
    }

    const data = snap.data() as Partial<SecurityConfig>;

    return {
      success: true,
      data: {
        lockdownEnabled: Boolean(data.lockdownEnabled),
        allowlistEmails: Array.isArray(data.allowlistEmails) ? data.allowlistEmails : [],
        allowlistUids: Array.isArray(data.allowlistUids) ? data.allowlistUids : [],
        ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : undefined,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
        updatedByUid: typeof data.updatedByUid === 'string' ? data.updatedByUid : undefined,
        updatedByEmail: typeof data.updatedByEmail === 'string' ? data.updatedByEmail : undefined,
      },
    };
  } catch (error) {
    console.error('Error getting security config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get security config',
    };
  }
}

export async function upsertSecurityConfig(
  actor: Pick<User, 'uid' | 'email'> | null,
  updates: Partial<Pick<SecurityConfig, 'lockdownEnabled' | 'allowlistEmails' | 'allowlistUids' | 'ownerUid'>>
): Promise<QueryResult<SecurityConfig>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const ref = doc(firestore, 'appConfig', 'securityConfig');
    const existing = await getSecurityConfig();
    const prev = existing.success && existing.data ? existing.data : { ...DEFAULT_SECURITY_CONFIG };

    // If ownerUid isn't set yet, set it to the first admin who writes config.
    const ownerUid = updates.ownerUid ?? prev.ownerUid ?? actor?.uid;

    const next: SecurityConfig = {
      lockdownEnabled: updates.lockdownEnabled ?? prev.lockdownEnabled,
      allowlistEmails: uniqueStrings((updates.allowlistEmails ?? prev.allowlistEmails).map(normalizeEmail)),
      allowlistUids: uniqueStrings(updates.allowlistUids ?? prev.allowlistUids),
      ownerUid: ownerUid || undefined,
    };

    await setDoc(
      ref,
      {
        ...next,
        updatedAt: serverTimestamp(),
        updatedByUid: actor?.uid ?? null,
        updatedByEmail: actor?.email ? normalizeEmail(actor.email) : null,
      },
      { merge: true }
    );

    return getSecurityConfig();
  } catch (error) {
    console.error('Error updating security config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update security config',
    };
  }
}

export async function setLockdownEnabled(
  actor: Pick<User, 'uid' | 'email'> | null,
  enabled: boolean
): Promise<QueryResult<SecurityConfig>> {
  return upsertSecurityConfig(actor, { lockdownEnabled: enabled });
}

export async function toggleAllowlistEmail(
  actor: Pick<User, 'uid' | 'email'> | null,
  email: string,
  shouldAllow: boolean
): Promise<QueryResult<SecurityConfig>> {
  const normalized = normalizeEmail(email);
  const existing = await getSecurityConfig();
  if (!existing.success || !existing.data) return existing;

  const allowlist = existing.data.allowlistEmails.map(normalizeEmail);
  const nextEmails = shouldAllow
    ? uniqueStrings([...allowlist, normalized])
    : allowlist.filter((e) => e !== normalized);

  return upsertSecurityConfig(actor, { allowlistEmails: nextEmails });
}
