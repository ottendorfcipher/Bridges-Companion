import { useState, useEffect } from 'react';
import { updateUserProfile } from '@utils/userProfile';
import type { User, UserRole, Permission } from '@/types/user';
import { getPermissionsForRole } from '@/types/user';
import { useAuth } from '@hooks/useAuth';
import { trackUserManagement } from '@utils/userActionTracker';
import styles from './UserEditModal.module.css';

interface UserEditModalProps {
  user: User;
  ownerUid?: string;
  onClose: () => void;
  onUpdate: (updatedUser: User) => void;
}

/**
 * UserEditModal - Detailed user editing with permission management
 */
export function UserEditModal({ user, ownerUid, onClose, onUpdate }: UserEditModalProps) {
  const { user: currentUser } = useAuth();
  const [role, setRole] = useState<UserRole>(user.role);
  const [permissions, setPermissions] = useState<Permission[]>(user.permissions);
  const [status, setStatus] = useState<'active' | 'disabled'>(user.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = Boolean(currentUser?.uid && currentUser.uid === user.uid);
  const isOwnerAccount = Boolean(ownerUid && ownerUid === user.uid);
  const isProtectedAccount = isSelf || isOwnerAccount;

  // Available permissions
  const availablePermissions: Permission[] = [
    'admin.full_access',
    'users.view',
    'users.edit',
    'content.view',
    'content.edit',
    'content.delete',
  ];

  // Update permissions when role changes
  useEffect(() => {
    const rolePermissions = getPermissionsForRole(role);
    setPermissions(rolePermissions);
  }, [role]);

  const handleTogglePermission = (permission: Permission) => {
    if (permissions.includes(permission)) {
      setPermissions(permissions.filter(p => p !== permission));
    } else {
      setPermissions([...permissions, permission]);
    }
  };

  const handleSave = async () => {
    if (isProtectedAccount) {
      // Defensive: the UI should already prevent these edits.
      if (isSelf) {
        setError('You cannot modify your own role/status via this panel.');
      } else {
        setError('The owner admin account cannot be modified via this panel.');
      }
      return;
    }

    setSaving(true);
    setError(null);

    const result = await updateUserProfile(user.uid, {
      role,
      permissions,
      status,
    });

    if (result.success && result.data) {
      // Track role change
      if (role !== user.role) {
        trackUserManagement(
          currentUser,
          'role_change',
          user.uid,
          user.displayName || user.email || 'Unknown',
          'role',
          user.role,
          role
        );
      }
      
      // Track status change
      if (status !== user.status) {
        trackUserManagement(
          currentUser,
          'status_change',
          user.uid,
          user.displayName || user.email || 'Unknown',
          'status',
          user.status,
          status
        );
      }
      
      onUpdate(result.data);
      onClose();
    } else {
      setError(result.error || 'Failed to update user');
    }

    setSaving(false);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Edit User</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.content}>
          {/* User Info */}
          <div className={styles.userInfo}>
            <div className={styles.avatar}>
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'User'} />
              ) : (
                <span>{user.displayName?.[0] || user.email?.[0] || '?'}</span>
              )}
            </div>
            <div>
              <div className={styles.userName}>{user.displayName || 'No name'}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
          </div>

          {/* Role Selection */}
          <div className={styles.field}>
            <label className={styles.label}>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className={styles.select}
              disabled={isProtectedAccount}
            >
              <option value="user">User</option>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            <p className={styles.hint}>
              {isSelf
                ? 'You cannot change your own role.'
                : isOwnerAccount
                  ? 'The owner admin account role cannot be changed.'
                  : 'Changing role automatically updates permissions'}
            </p>
          </div>

          {/* Status Toggle */}
          <div className={styles.field}>
            <label className={styles.label}>Account Status</label>
            <div className={styles.statusToggle}>
              <button
                className={`${styles.statusButton} ${status === 'active' ? styles.active : ''}`}
                onClick={() => setStatus('active')}
                disabled={isProtectedAccount}
              >
                ✓ Active
              </button>
              <button
                className={`${styles.statusButton} ${status === 'disabled' ? styles.active : ''}`}
                onClick={() => setStatus('disabled')}
                disabled={isProtectedAccount}
              >
                🚫 Disabled
              </button>
            </div>
          </div>

          {/* Custom Permissions */}
          <div className={styles.field}>
            <label className={styles.label}>Custom Permissions</label>
            <p className={styles.hint}>Override default role permissions (advanced)</p>
            <div className={styles.permissionList}>
              {availablePermissions.map((permission) => (
                <label key={permission} className={styles.permissionItem}>
                  <input
                    type="checkbox"
                    checked={permissions.includes(permission)}
                    onChange={() => handleTogglePermission(permission)}
                    className={styles.checkbox}
                    disabled={isProtectedAccount}
                  />
                  <span className={styles.permissionName}>{permission}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className={styles.error}>
              <span className={styles.errorIcon}>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button onClick={onClose} className={styles.cancelButton} disabled={saving}>
            Cancel
          </button>
          <button onClick={handleSave} className={styles.saveButton} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
