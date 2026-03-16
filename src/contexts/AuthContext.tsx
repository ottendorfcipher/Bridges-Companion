import { createContext, useEffect, useRef, useState, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Timestamp, doc, onSnapshot } from 'firebase/firestore';
import { auth, configError, firestore } from '@config/firebase';
import type { User } from '@/types/user';
import { createUserProfile, type UserProfileData } from '@utils/userProfile';
import { handleRedirectResult, signOut } from '@utils/auth';
import { getSecurityConfig, isUserWhitelisted, type SecurityConfig } from '@utils/securityConfig';

/**
 * AuthContext value type
 */
export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * AuthContext - provides authentication state to the app
 */
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * AuthProvider props
 */
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider - wraps the app and manages authentication state
 * 
 * Listens to Firebase auth state changes and updates context accordingly.
 * Auth state persists across page refreshes via Firebase SDK's IndexedDB storage.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const mapUserProfile = (uid: string, data: UserProfileData): User => {
    return {
      uid,
      email: data.email ?? null,
      displayName: data.displayName ?? null,
      photoURL: data.photoURL ?? null,
      role: data.role,
      permissions: data.permissions,
      status: data.status,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt as string),
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : (data.updatedAt as string),
      lastLoginAt: data.lastLoginAt
        ? (data.lastLoginAt instanceof Timestamp ? data.lastLoginAt.toDate().toISOString() : (data.lastLoginAt as string))
        : undefined,
    };
  };

  useEffect(() => {
    // Check if Firebase is configured
    if (configError) {
      setError(configError);
      setUser(null);
      setLoading(false);
      return;
    }

    // Check if auth is available
    if (!auth) {
      setError('Firebase authentication is not initialized');
      setUser(null);
      setLoading(false);
      return;
    }

    // Handle redirect result (for Safari/mobile OAuth flow)
    handleRedirectResult().catch((err) => {
      console.error('Redirect result error:', err);
      setError(err.message || 'Sign-in failed. Please try again.');
    });

    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeSecurity: (() => void) | null = null;
    let signingOut = false;

    const forceSignOut = async (message: string) => {
      if (signingOut) return;
      signingOut = true;
      setUser(null);
      setError(message);
      try {
        await signOut();
      } catch (e) {
        console.error('Failed to sign out:', e);
      } finally {
        signingOut = false;
      }
    };

    const stopRealtimeGuards = () => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }
      if (unsubscribeSecurity) {
        unsubscribeSecurity();
        unsubscribeSecurity = null;
      }
    };

    const startRealtimeGuards = (uid: string) => {
      if (!firestore) return;

      // Watch the user's profile for status/role/permission changes.
      unsubscribeProfile = onSnapshot(
        doc(firestore, 'users', uid),
        async (snap) => {
          if (!snap.exists()) {
            await forceSignOut('Unable to load your user profile. Please try again.');
            return;
          }

          const data = snap.data() as UserProfileData;
          const nextUser = mapUserProfile(uid, data);

          if (nextUser.status === 'disabled') {
            await forceSignOut('This account has been disabled. Please contact an administrator.');
            return;
          }

          setUser((prev) => {
            // If we're already signed out, don't resurrect state.
            if (!prev) return prev;
            return {
              ...prev,
              role: nextUser.role,
              permissions: nextUser.permissions,
              status: nextUser.status,
              updatedAt: nextUser.updatedAt,
              lastLoginAt: nextUser.lastLoginAt,
            };
          });
        },
        (err) => {
          console.error('User profile listener error:', err);
        }
      );

      // Watch security config (lockdown allowlist) and kick users out if they lose access.
      unsubscribeSecurity = onSnapshot(
        doc(firestore, 'appConfig', 'securityConfig'),
        async (snap) => {
          const data = (snap.exists() ? (snap.data() as SecurityConfig) : null) ?? {
            lockdownEnabled: false,
            allowlistEmails: [],
            allowlistUids: [],
          };

          const current = userRef.current;
          if (!current) return;

          if (data.lockdownEnabled && !isUserWhitelisted(current, data)) {
            await forceSignOut('Access restricted: your account is not whitelisted. Please contact an administrator.');
          }
        },
        (err) => {
          console.error('Security config listener error:', err);
        }
      );
    };

    // Subscribe to auth state changes
    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        try {
          // Stop listeners for previous user (if any)
          stopRealtimeGuards();

          if (firebaseUser) {
            // User is signed in - must load Firestore profile (no fallback in lockdown/disabled world).
            console.log('User signed in, loading Firestore profile...');

            const profileResult = await createUserProfile(
              firebaseUser.uid,
              firebaseUser.email,
              firebaseUser.displayName,
              firebaseUser.photoURL
            );

            if (!profileResult.success || !profileResult.data) {
              // If profile creation/loading fails (e.g. due to lockdown rules), sign out and show a clear message.
              const sec = await getSecurityConfig();
              const lockdownOn = Boolean(sec.success && sec.data?.lockdownEnabled);

              setUser(null);
              setError(
                lockdownOn
                  ? 'Access restricted: your account is not whitelisted. Please contact an administrator.'
                  : (profileResult.error || 'Unable to load your user profile. Please try again.')
              );

              await signOut();
              return;
            }

            const profile = profileResult.data;

            // Disabled users must not access the app beyond auth.
            if (profile.status === 'disabled') {
              setUser(null);
              setError('This account has been disabled. Please contact an administrator.');
              await signOut();
              return;
            }

            // Lockdown mode: only allow allowlisted users (admins always allowed).
            const sec = await getSecurityConfig();
            if (sec.success && sec.data?.lockdownEnabled) {
              if (!isUserWhitelisted(profile, sec.data)) {
                setUser(null);
                setError('Access restricted: your account is not whitelisted. Please contact an administrator.');
                await signOut();
                return;
              }
            }

            console.log('Firestore profile loaded:', profile.role);
            setUser(profile);
            setError(null);

            startRealtimeGuards(firebaseUser.uid);
          } else {
            // User is signed out
            console.log('User signed out');
            setUser(null);
            // Intentionally do not clear `error` here; it may contain a gate/denial message.
          }
        } catch (err) {
          console.error('Auth error:', err);
          setError(err instanceof Error ? err.message : 'Failed to load user');
          setUser(null);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        // Handle auth state change errors
        setError(err.message);
        setUser(null);
        setLoading(false);
      }
    );

    // Cleanup subscription on unmount
    return () => {
      stopRealtimeGuards();
      unsubscribeAuth();
    };
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    error,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
