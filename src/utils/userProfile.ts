import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  getDocs,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { firestore } from '@config/firebase';
import type { User, UserRole, Permission } from '@/types/user';
import { getPermissionsForRole } from '@/types/user';

/**
 * Firestore user profile data structure
 */
export interface UserProfileData {
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  permissions: Permission[];
  status: 'active' | 'disabled';
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
  lastLoginAt?: Timestamp | string;
}

/**
 * Result type for user profile operations
 */
export interface UserProfileResult<T = User> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new user profile in Firestore on first sign-in
 * New users default to 'user' role with basic permissions
 */
export async function createUserProfile(
  uid: string,
  email: string | null,
  displayName: string | null,
  photoURL: string | null
): Promise<UserProfileResult> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const userRef = doc(firestore, 'users', uid);
    
    // Check if profile already exists
    const existingDoc = await getDoc(userRef);
    if (existingDoc.exists()) {
      // Update last login and return existing profile
      await updateDoc(userRef, {
        lastLoginAt: serverTimestamp(),
      });
      return getUserProfile(uid);
    }

    // Create new profile with default role
    const profileData = {
      email,
      displayName,
      photoURL,
      role: 'user' as const,
      permissions: getPermissionsForRole('user'),
      status: 'active' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };

    await setDoc(userRef, profileData);

    // Fetch and return the created profile
    return getUserProfile(uid);
  } catch (error) {
    console.error('Error creating user profile:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create user profile',
    };
  }
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(uid: string): Promise<UserProfileResult> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const userRef = doc(firestore, 'users', uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return { success: false, error: 'User profile not found' };
    }

    const data = userDoc.data() as UserProfileData;
    
    // Convert Firestore Timestamps to ISO strings
    const user: User = {
      uid,
      email: data.email,
      displayName: data.displayName,
      photoURL: data.photoURL,
      role: data.role,
      permissions: data.permissions,
      status: data.status,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
      lastLoginAt: data.lastLoginAt 
        ? (data.lastLoginAt instanceof Timestamp ? data.lastLoginAt.toDate().toISOString() : data.lastLoginAt)
        : undefined,
    };

    return { success: true, data: user };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch user profile',
    };
  }
}

/**
 * Update user profile data
 * Admin function - should be protected by Firestore security rules
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<Omit<UserProfileData, 'createdAt' | 'uid'>>
): Promise<UserProfileResult> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const userRef = doc(firestore, 'users', uid);
    
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });

    return getUserProfile(uid);
  } catch (error) {
    console.error('Error updating user profile:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update user profile',
    };
  }
}

/**
 * Set user role and update permissions accordingly
 * Admin function - should be protected by Firestore security rules
 */
export async function setUserRole(uid: string, role: UserRole): Promise<UserProfileResult> {
  const permissions = getPermissionsForRole(role);
  
  return updateUserProfile(uid, {
    role,
    permissions,
  });
}

/**
 * Toggle user account status (active/disabled)
 * Admin function - should be protected by Firestore security rules
 */
export async function toggleUserStatus(uid: string): Promise<UserProfileResult> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    // First get current status
    const profileResult = await getUserProfile(uid);
    if (!profileResult.success || !profileResult.data) {
      return profileResult;
    }

    const newStatus = profileResult.data.status === 'active' ? 'disabled' : 'active';
    
    return updateUserProfile(uid, {
      status: newStatus,
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle user status',
    };
  }
}

/**
 * Get all users from Firestore
 * Admin function - should be protected by Firestore security rules
 */
export async function getAllUsers(): Promise<UserProfileResult<User[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const usersRef = collection(firestore, 'users');
    const q = query(usersRef);
    const querySnapshot = await getDocs(q);

    const users: User[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as UserProfileData;
      users.push({
        uid: doc.id,
        email: data.email,
        displayName: data.displayName,
        photoURL: data.photoURL,
        role: data.role,
        permissions: data.permissions,
        status: data.status,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        lastLoginAt: data.lastLoginAt 
          ? (data.lastLoginAt instanceof Timestamp ? data.lastLoginAt.toDate().toISOString() : data.lastLoginAt)
          : undefined,
      });
    });

    return { success: true, data: users };
  } catch (error) {
    console.error('Error fetching all users:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch users',
    };
  }
}
