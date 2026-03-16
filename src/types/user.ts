/**
 * User model types for Firebase Authentication and Firestore
 */

/**
 * User roles for permission-based access control
 */
export type UserRole = 'admin' | 'editor' | 'viewer' | 'user';

/**
 * User account status
 */
export type UserStatus = 'active' | 'disabled';

/**
 * Permission strings for granular access control
 */
export type Permission =
  | 'admin.full_access'
  | 'users.view'
  | 'users.edit'
  | 'content.view'
  | 'content.edit'
  | 'content.delete';

/**
 * User model with authentication and permission data
 */
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: string;
  role: UserRole;
  permissions: Permission[];
  status: UserStatus;
  updatedAt?: string;
  lastLoginAt?: string;
}

/**
 * Authentication error types
 * Maps to common Firebase Auth error codes
 */
export type AuthErrorCode =
  | 'auth/popup-closed-by-user'
  | 'auth/network-request-failed'
  | 'auth/popup-blocked'
  | 'auth/account-exists-with-different-credential'
  | 'auth/cancelled-popup-request'
  | 'auth/unauthorized-domain'
  | 'auth/operation-not-allowed'
  | 'auth/user-disabled'
  | 'auth/too-many-requests'
  | 'auth/configuration-not-found'
  | 'unknown';

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

/**
 * Helper function to create user-friendly error messages
 */
export function getAuthErrorMessage(code: AuthErrorCode): string {
  const errorMessages: Record<AuthErrorCode, string> = {
    'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again.',
    'auth/network-request-failed':
      'No internet connection. Please check your network and try again.',
    'auth/popup-blocked':
      'Pop-up was blocked by your browser. Please allow pop-ups and try again.',
    'auth/account-exists-with-different-credential':
      'An account already exists with this email. Please sign in using your original method.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled. Please try again.',
    'auth/unauthorized-domain':
      'This domain is not authorized for sign-in. Please contact support.',
    'auth/operation-not-allowed':
      'Google sign-in is not enabled. Please contact support.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/too-many-requests':
      'Too many failed sign-in attempts. Please try again later.',
    'auth/configuration-not-found':
      'Firebase is not configured correctly. Please check your .env file.',
    unknown: 'An unexpected error occurred. Please try again.',
  };

  return errorMessages[code] || errorMessages.unknown;
}

/**
 * Role-based permission mappings
 * Defines default permissions for each role
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'admin.full_access',
    'users.view',
    'users.edit',
    'content.view',
    'content.edit',
    'content.delete',
  ],
  editor: ['users.view', 'content.view', 'content.edit'],
  viewer: ['content.view'],
  user: ['content.view'],
};

/**
 * Get default permissions for a role
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;
}

/**
 * Check if a user has a specific permission
 */
export function hasPermission(user: User | null, permission: Permission): boolean {
  if (!user) return false;
  if (user.status === 'disabled') return false;

  // All admins are treated as having all permissions.
  // This prevents "admin but missing permissions[]" mismatches from blocking critical actions.
  if (isAdmin(user)) return true;

  return user.permissions.includes(permission) || user.permissions.includes('admin.full_access');
}

/**
 * Check if a user has any of the specified permissions
 */
export function hasAnyPermission(user: User | null, permissions: Permission[]): boolean {
  if (!user) return false;
  return permissions.some((permission) => hasPermission(user, permission));
}

/**
 * Check if a user is an admin
 */
export function isAdmin(user: User | null): boolean {
  return user?.role === 'admin' && user?.status === 'active';
}

/**
 * Convert Firebase User to our User type (without Firestore data)
 * This is a partial user object that needs to be enriched with Firestore profile
 */
export function mapFirebaseUser(firebaseUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  metadata: { creationTime?: string };
}): Partial<User> {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    createdAt: firebaseUser.metadata.creationTime || new Date().toISOString(),
  };
}
