import { useAuth } from './useAuth';
import type { Permission } from '@/types/user';
import { hasPermission, hasAnyPermission, isAdmin } from '@/types/user';

/**
 * usePermissions hook
 * 
 * Provides utilities for checking user permissions in components
 */
export function usePermissions() {
  const { user } = useAuth();

  return {
    /**
     * Check if user has a specific permission
     */
    hasPermission: (permission: Permission): boolean => {
      return hasPermission(user, permission);
    },

    /**
     * Check if user has any of the specified permissions
     */
    hasAnyPermission: (permissions: Permission[]): boolean => {
      return hasAnyPermission(user, permissions);
    },

    /**
     * Check if user is an admin
     */
    isAdmin: (): boolean => {
      return isAdmin(user);
    },

    /**
     * Check if user can access admin panel
     */
    canAccessAdmin: (): boolean => {
      return (
        hasPermission(user, 'admin.full_access') ||
        hasPermission(user, 'users.view') ||
        hasPermission(user, 'content.edit')
      );
    },

    /**
     * Check if user can edit users
     */
    canEditUsers: (): boolean => {
      return hasPermission(user, 'users.edit');
    },

    /**
     * Check if user can edit content
     */
    canEditContent: (): boolean => {
      return hasPermission(user, 'content.edit');
    },

    /**
     * Check if user can delete content
     */
    canDeleteContent: (): boolean => {
      return hasPermission(user, 'content.delete');
    },
  };
}
