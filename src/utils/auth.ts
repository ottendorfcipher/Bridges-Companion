import {
  signInWithPopup,
  getRedirectResult,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, configError } from '@config/firebase';
import type { User, AuthError, AuthErrorCode } from '@/types/user';
import { mapFirebaseUser, getAuthErrorMessage } from '@/types/user';

/**
 * Google OAuth provider instance
 */
const googleProvider = new GoogleAuthProvider();


/**
 * Sign in with Google OAuth
 * Uses popup for desktop browsers, redirect for Safari/mobile
 * 
 * @returns Promise<Partial<User>> - The authenticated user (or empty for redirect)
 * @throws AuthError - If sign-in fails
 */
export async function signInWithGoogle(): Promise<Partial<User>> {
  if (configError || !auth) {
    console.error('Auth configuration error:', configError);
    throw {
      code: 'auth/configuration-not-found',
      message: configError || 'Firebase is not configured',
    } as AuthError;
  }

  try {
    // Always try popup first (works better with storage partitioning)
    console.log('Attempting popup sign-in');
    const result = await signInWithPopup(auth, googleProvider);
    console.log('Popup sign-in successful');
    return mapFirebaseUser(result.user);
  } catch (error: unknown) {
    console.error('Sign-in error:', error);
    throw handleAuthError(error);
  }
}

/**
 * Handle the redirect result after Google sign-in
 * Call this on app initialization to complete the sign-in flow
 * 
 * @returns Promise<Partial<User> | null> - The authenticated user or null if no redirect
 * @throws AuthError - If sign-in fails
 */
export async function handleRedirectResult(): Promise<Partial<User> | null> {
  if (configError || !auth) {
    console.log('Skipping redirect result check - auth not configured');
    return null;
  }

  try {
    console.log('Checking for redirect result...');
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log('Redirect sign-in successful:', result.user.email);
      return mapFirebaseUser(result.user);
    }
    console.log('No redirect result found');
    return null;
  } catch (error: unknown) {
    console.error('Redirect result error:', error);
    throw handleAuthError(error);
  }
}

/**
 * Sign out the current user
 * 
 * @throws AuthError - If sign-out fails
 */
export async function signOut(): Promise<void> {
  if (!auth) {
    throw {
      code: 'auth/configuration-not-found',
      message: 'Firebase is not configured',
    } as AuthError;
  }

  try {
    await firebaseSignOut(auth);
  } catch (error: unknown) {
    throw handleAuthError(error);
  }
}

/**
 * Get the current authenticated user
 * 
 * @returns Partial<User> | null - The current user or null if not authenticated
 */
export function getCurrentUser(): Partial<User> | null {
  if (!auth) {
    return null;
  }
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    return null;
  }
  return mapFirebaseUser(firebaseUser);
}

/**
 * Convert Firebase auth error to our AuthError type
 */
function handleAuthError(error: unknown): AuthError {
  // Handle Firebase auth errors
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code as AuthErrorCode;
    return {
      code,
      message: getAuthErrorMessage(code),
    };
  }

  // Handle generic errors
  if (error instanceof Error) {
    return {
      code: 'unknown',
      message: error.message,
    };
  }

  // Fallback for unknown error types
  return {
    code: 'unknown',
    message: 'An unexpected error occurred',
  };
}

/**
 * Check if the user is authenticated
 * 
 * @returns boolean - True if user is authenticated
 */
export function isAuthenticated(): boolean {
  return auth?.currentUser !== null;
}

/**
 * Convert Firebase User to our User type (utility export)
 */
export function convertFirebaseUser(firebaseUser: FirebaseUser): Partial<User> {
  return mapFirebaseUser(firebaseUser);
}
