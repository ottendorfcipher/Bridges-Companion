import { initializeApp, FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

/**
 * Firebase configuration from environment variables
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Firebase App Check (reCAPTCHA v3)
// This is a *site key* (public). The reCAPTCHA *secret key* must never be shipped to the client.
const appCheckSiteKey: string | undefined = import.meta.env.VITE_FIREBASE_APPCHECK_RECAPTCHA_V3_SITE_KEY;
const appCheckDebug: boolean = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG === 'true';

/**
 * Validate Firebase configuration
 * Returns error message if configuration is invalid, null otherwise
 */
function validateFirebaseConfig(): string | null {
  const requiredFields = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
  ];

  const missingFields = requiredFields.filter(
    (field) => !firebaseConfig[field as keyof typeof firebaseConfig]
  );

  if (missingFields.length > 0) {
    return `Missing required Firebase environment variables: ${missingFields
      .map((f) => `VITE_FIREBASE_${f.replace(/([A-Z])/g, '_$1').toUpperCase()}`)
      .join(', ')}.\n\nPlease create a .env file based on .env.example and add your Firebase credentials.`;
  }

  return null;
}

/**
 * Check if Firebase is configured
 */
export const configError = validateFirebaseConfig();

/**
 * Initialize Firebase app (only if config is valid)
 * This is a singleton - only one instance is created
 */
export const app: FirebaseApp | null = configError ? null : initializeApp(firebaseConfig);

/**
 * Firebase App Check
 *
 * Best practice:
 * - initialize as early as possible (before Firestore/Storage calls)
 * - enable token auto-refresh
 * - use debug token only in development
 */
export const appCheck: AppCheck | null = (() => {
  if (!app || !appCheckSiteKey) return null;

  // Enable debug mode for local development.
  // Firebase will print a debug token to the console the first time App Check runs.
  if (import.meta.env.DEV && appCheckDebug) {
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  return initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
})();

/**
 * Get Firebase Auth instance (only if app is initialized)
 * This is the main auth object used throughout the app
 */
export const auth: Auth | null = app ? getAuth(app) : null;

/**
 * Get Firestore instance (only if app is initialized)
 * Used for user profiles, permissions, and other cloud data
 */
export const firestore: Firestore | null = app ? getFirestore(app) : null;

/**
 * Get Firebase Storage instance (only if app is initialized)
 * Used for uploaded icons/images for the CMS.
 */
export const storage: FirebaseStorage | null = app ? getStorage(app) : null;
