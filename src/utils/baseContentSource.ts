export type BaseContentSource = 'sqlite' | 'firestore';

const STORAGE_KEY = 'bridge:base-content-source';

export function getBaseContentSourceOverride(): BaseContentSource | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'sqlite' || raw === 'firestore') return raw;
    return null;
  } catch {
    return null;
  }
}

export function setBaseContentSourceOverride(source: BaseContentSource | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!source) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, source);
  } catch {
    // ignore
  }
}

export function resolveBaseContentSource(): BaseContentSource {
  // Never attempt to use Firestore for base content if the browser is offline.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'sqlite';
  }

  const override = getBaseContentSourceOverride();
  if (override) return override;

  const raw = (import.meta.env.VITE_BASE_CONTENT_SOURCE || '').trim().toLowerCase();
  if (raw === 'firestore' || raw === 'sqlite') return raw;

  // Default is sqlite (safe/offline-first)
  return 'sqlite';
}
