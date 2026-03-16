import { ReactNode } from 'react';
import { usePermissions } from '@hooks/usePermissions';
import type { Permission } from '@/types/user';

/**
 * PermissionGuard props
 */
interface PermissionGuardProps {
  /**
   * Required permission to view children
   */
  permission?: Permission;

  /**
   * List of permissions (user needs ANY of these)
   */
  anyOf?: Permission[];

  /**
   * List of permissions (user needs ALL of these)
   */
  allOf?: Permission[];

  /**
   * Require admin role
   */
  requireAdmin?: boolean;

  /**
   * Children to render if permission check passes
   */
  children: ReactNode;

  /**
   * Fallback to render if permission check fails
   * If not provided, renders nothing
   */
  fallback?: ReactNode;
}

/**
 * PermissionGuard component
 * 
 * Conditionally renders children based on user permissions.
 * Supports single permission, any-of, all-of, and admin-only modes.
 * 
 * @example
 * ```tsx
 * <PermissionGuard permission="users.edit">
 *   <EditButton />
 * </PermissionGuard>
 * ```
 * 
 * @example
 * ```tsx
 * <PermissionGuard anyOf={['content.edit', 'content.delete']}>
 *   <ContentActions />
 * </PermissionGuard>
 * ```
 */
export function PermissionGuard({
  permission,
  anyOf,
  allOf,
  requireAdmin,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const permissions = usePermissions();

  // Check admin requirement
  if (requireAdmin && !permissions.isAdmin()) {
    return <>{fallback}</>;
  }

  // Check single permission
  if (permission && !permissions.hasPermission(permission)) {
    return <>{fallback}</>;
  }

  // Check any-of permissions
  if (anyOf && !permissions.hasAnyPermission(anyOf)) {
    return <>{fallback}</>;
  }

  // Check all-of permissions
  if (allOf && !allOf.every((p) => permissions.hasPermission(p))) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
