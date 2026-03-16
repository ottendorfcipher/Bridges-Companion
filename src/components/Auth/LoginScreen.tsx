import { useState, useEffect } from 'react';
import { signInWithGoogle } from '@utils/auth';
import { useOnline } from '@hooks/useDatabase';
import { configError } from '@config/firebase';
import type { AuthError } from '@/types/user';
import { useAuth } from '@hooks/useAuth';
import styles from './LoginScreen.module.css';

/**
 * LoginScreen - Full-screen authentication screen
 * 
 * Displays app branding and Google sign-in button.
 * Follows Apple HIG design patterns.
 */
export function LoginScreen() {
  const { error: authError, clearError } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOnline();

  const displayError = authError || error;

  // Check for Firebase configuration errors on mount
  useEffect(() => {
    if (configError) {
      setError(configError);
    }
  }, []);

  const handleSignIn = async () => {
    console.log('Sign in button clicked');
    
    if (!isOnline) {
      setError('Internet connection required to sign in. Please check your network.');
      return;
    }

    setLoading(true);
    clearError();
    setError(null);

    try {
      console.log('Calling signInWithGoogle...');
      const result = await signInWithGoogle();
      console.log('signInWithGoogle result:', result);
      
      // If result is empty, user was redirected (Safari/mobile)
      // If result has data, popup succeeded (desktop)
      if (result && Object.keys(result).length > 0) {
        // Popup succeeded, AuthContext will handle the rest
        console.log('Popup sign-in succeeded');
        setLoading(false);
      } else {
        console.log('Redirect initiated, keeping loading state');
      }
      // Otherwise, loading persists until redirect completes
    } catch (err) {
      console.error('Sign-in error:', err);
      const authError = err as AuthError;
      let errorMessage = authError.message;
      
      // Add helpful context for common mobile errors
      if (authError.code === 'auth/unauthorized-domain') {
        errorMessage = 'This domain is not authorized. Please add g-bridges.web.app to Firebase Console > Authentication > Settings > Authorized domains.';
      } else if (authError.code === 'auth/popup-blocked') {
        errorMessage = 'Sign-in popup was blocked. Please allow popups for this site or try again.';
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* App Logo/Icon */}
        <div className={styles.logoContainer}>
          <img 
            src="/images/bridges_dark_main_icon.png" 
            alt="Bridge Companion Logo"
            className={styles.logo}
          />
        </div>

        {/* App Name */}
        <h1 className={styles.title}>Bridge Companion</h1>

        {/* Tagline */}
        <p className={styles.subtitle}>
          Your educational content platform
        </p>

        {/* Sign In Button */}
        <button
          className={styles.signInButton}
          onClick={handleSignIn}
          disabled={loading || !isOnline}
          aria-label="Sign in with Google"
          type="button"
        >
          {loading ? (
            <>
              <span className={styles.spinner} />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <svg
                className={styles.googleIcon}
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>Sign in with Google</span>
            </>
          )}
        </button>

        {/* Error Message */}
        {displayError && (
          <div className={styles.error} role="alert">
            <span className={styles.errorIcon}>⚠️</span>
            <div>
              <div>{displayError}</div>
              {configError && (
                <div className={styles.errorHelp}>
                  <strong>Setup Steps:</strong>
                  <ol>
                    <li>Copy <code>.env.example</code> to <code>.env</code></li>
                    <li>Add your Firebase credentials to <code>.env</code></li>
                    <li>Restart the dev server</li>
                  </ol>
                  <div>See <code>FIREBASE_SETUP.md</code> for detailed instructions.</div>
                </div>
              )}
            </div>
            <button
              type="button"
              className={styles.errorDismiss}
              onClick={() => {
                clearError();
                setError(null);
              }}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {/* Offline Warning */}
        {!isOnline && !displayError && (
          <div className={styles.warning} role="status">
            <span className={styles.warningIcon}>📡</span>
            <span>You are offline. Connect to the internet to sign in.</span>
          </div>
        )}

        {/* Footer */}
        <p className={styles.footer}>
          Sign in to access educational content and resources
        </p>
      </div>
    </div>
  );
}
