import { useState } from 'react';
import { signOut } from '@utils/auth';
import type { User } from '@/types/user';
import styles from './UserProfile.module.css';

/**
 * UserProfile component props
 */
interface UserProfileProps {
  user: User;
}

/**
 * UserProfile - Display user information and sign-out button
 * 
 * Shows user's profile picture, name, and email with sign-out option.
 * Used in Sidebar and HamburgerMenu.
 */
export function UserProfile({ user }: UserProfileProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    setError(null);

    try {
      await signOut();
      // Force page reload to clear all cached state
      window.location.reload();
    } catch (err) {
      setError('Failed to sign out. Please try again.');
      setSigningOut(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* User Info */}
      <div className={styles.userInfo}>
        {/* Profile Picture */}
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'User'}
            className={styles.avatar}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={styles.avatarPlaceholder}>
            {(user.displayName?.[0] || user.email?.[0] || '?').toUpperCase()}
          </div>
        )}

        {/* Name and Email */}
        <div className={styles.details}>
          <div className={styles.name}>
            {user.displayName || 'User'}
          </div>
          {user.email && (
            <div className={styles.email}>
              {user.email}
            </div>
          )}
        </div>
      </div>

      {/* Sign Out Button */}
      <button
        className={styles.signOutButton}
        onClick={handleSignOut}
        disabled={signingOut}
        aria-label="Sign out"
      >
        {signingOut ? 'Signing out...' : 'Sign Out'}
      </button>

      {/* Error Message */}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
