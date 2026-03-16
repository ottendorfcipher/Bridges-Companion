import { useState, useEffect } from 'react';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { getAllUsers, setUserRole, toggleUserStatus } from '@utils/userProfile';
import type { User, UserRole } from '@/types/user';
import { UserEditModal } from './UserEditModal';
import { getSecurityConfig, setLockdownEnabled, toggleAllowlistEmail, type SecurityConfig } from '@utils/securityConfig';
import { trackUserAction, trackUserManagement } from '@utils/userActionTracker';
import styles from './UserList.module.css';

/**
 * UserList - User management with inline editing
 */
export function UserList() {
  const { user: currentUser } = useAuth();
  const permissions = usePermissions();
  const [users, setUsers] = useState<User[]>([]);
  const [securityConfig, setSecurityConfigState] = useState<SecurityConfig | null>(null);
  const [newAllowEmail, setNewAllowEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  useEffect(() => {
    void loadUsers();
    void loadSecurityConfig();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);

    const result = await getAllUsers();
    if (result.success && result.data) {
      setUsers(result.data);
    } else {
      setError(result.error || 'Failed to load users');
    }

    setLoading(false);
  };

  const loadSecurityConfig = async () => {
    const result = await getSecurityConfig();
    if (result.success && result.data) {
      setSecurityConfigState(result.data);
    } else {
      // Don't hard-fail the users panel; show the error banner.
      setError(result.error || 'Failed to load access control settings');
    }
  };

  const normalizeEmail = (email: string) => email.trim().toLowerCase();

  const ownerUid = securityConfig?.ownerUid;
  const lockdownEnabled = Boolean(securityConfig?.lockdownEnabled);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    if (!permissions.canEditUsers()) return;

    const target = users.find((u) => u.uid === uid);
    if (ownerUid && uid === ownerUid) {
      setError('The owner admin account cannot have its role changed.');
      return;
    }

    setUpdating(uid);
    const result = await setUserRole(uid, newRole);

    if (result.success && result.data) {
      setUsers(users.map(u => u.uid === uid ? result.data! : u));

      if (currentUser && target && target.role !== newRole) {
        trackUserManagement(
          currentUser,
          'role_change',
          uid,
          target.displayName || target.email || 'Unknown',
          'role',
          target.role,
          newRole
        );
      }
    } else {
      setError(result.error || 'Failed to update user role');
    }

    setUpdating(null);
  };

  const handleToggleStatus = async (uid: string) => {
    if (!permissions.canEditUsers()) return;

    const target = users.find((u) => u.uid === uid);
    if (currentUser?.uid === uid) {
      setError('You cannot disable your own account.');
      return;
    }
    if (ownerUid && uid === ownerUid) {
      setError('The owner admin account cannot be disabled.');
      return;
    }

    setUpdating(uid);
    const result = await toggleUserStatus(uid);

    if (result.success && result.data) {
      setUsers(users.map(u => u.uid === uid ? result.data! : u));

      if (currentUser && target && target.status !== result.data.status) {
        trackUserManagement(
          currentUser,
          'status_change',
          uid,
          target.displayName || target.email || 'Unknown',
          'status',
          target.status,
          result.data.status
        );
      }
    } else {
      setError(result.error || 'Failed to toggle user status');
    }

    setUpdating(null);
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.email?.toLowerCase().includes(searchLower) ||
      user.displayName?.toLowerCase().includes(searchLower) ||
      user.role.toLowerCase().includes(searchLower)
    );
  });

  const isEmailAllowlisted = (email: string | null): boolean => {
    if (!email) return false;
    const normalized = normalizeEmail(email);
    return Boolean(securityConfig?.allowlistEmails?.map(normalizeEmail).includes(normalized));
  };

  const handleToggleLockdown = async (enabled: boolean) => {
    if (!permissions.canEditUsers()) return;
    if (!currentUser) return;

    setUpdating('security:lockdown');
    setError(null);

    const prev = lockdownEnabled;
    const result = await setLockdownEnabled(currentUser, enabled);

    if (result.success && result.data) {
      setSecurityConfigState(result.data);

      trackUserAction(currentUser, 'security_lockdown_toggle', {
        resourceType: 'user',
        resourceId: 'lockdown',
        resourceName: 'Lockdown Mode',
        oldValue: String(prev),
        newValue: String(enabled),
        immediate: true,
      });
    } else {
      setError(result.error || 'Failed to update lockdown mode');
    }

    setUpdating(null);
  };

  const handleToggleAllowEmail = async (email: string, shouldAllow: boolean) => {
    if (!permissions.canEditUsers()) return;
    if (!currentUser) return;

    const normalized = normalizeEmail(email);
    setUpdating(`security:allow:${normalized}`);
    setError(null);

    const result = await toggleAllowlistEmail(currentUser, normalized, shouldAllow);
    if (result.success && result.data) {
      setSecurityConfigState(result.data);

      trackUserAction(currentUser, 'security_allowlist_update', {
        resourceType: 'user',
        resourceId: normalized,
        resourceName: normalized,
        field: 'status',
        oldValue: shouldAllow ? 'not_whitelisted' : 'whitelisted',
        newValue: shouldAllow ? 'whitelisted' : 'not_whitelisted',
        metadata: { allow: shouldAllow, email: normalized },
        immediate: true,
      });
    } else {
      setError(result.error || 'Failed to update whitelist');
    }

    setUpdating(null);
  };

  const handleAddAllowEmail = async () => {
    const email = newAllowEmail.trim();
    if (!email) return;
    await handleToggleAllowEmail(email, true);
    setNewAllowEmail('');
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>User Management</h1>
        <div className={styles.loading}>Loading users...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>User Management</h1>
          <p className={styles.subtitle}>{users.length} total users</p>
        </div>
      </div>

      {error && (
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠️</span>
          <p>{error}</p>
          <button onClick={() => setError(null)} className={styles.errorDismiss}>×</button>
        </div>
      )}

      {permissions.canEditUsers() && (
        <div className={styles.securityCard}>
          <div className={styles.securityTitleRow}>
            <div>
              <div className={styles.securityTitle}>Access Control</div>
              <div className={styles.securitySubtitle}>
                Lockdown blocks sign-in for non-whitelisted users. Admins are always allowed.
              </div>
            </div>
          </div>

          <label className={styles.lockdownRow}>
            <input
              type="checkbox"
              checked={lockdownEnabled}
              disabled={updating === 'security:lockdown'}
              onChange={(e) => void handleToggleLockdown(e.target.checked)}
            />
            <div>
              <div className={styles.lockdownLabel}>Lockdown mode (whitelist-only)</div>
              <div className={styles.lockdownHint}>
                Default is OFF. Turn ON to restrict access to whitelisted emails.
              </div>
            </div>
          </label>

          <div className={styles.allowlistRow}>
            <input
              type="email"
              placeholder="Whitelist email (e.g. person@example.com)"
              value={newAllowEmail}
              onChange={(e) => setNewAllowEmail(e.target.value)}
              className={styles.allowlistInput}
              disabled={updating?.startsWith('security:')}
            />
            <button
              type="button"
              className={styles.allowlistButton}
              onClick={() => void handleAddAllowEmail()}
              disabled={!newAllowEmail.trim() || updating?.startsWith('security:')}
            >
              Add
            </button>
          </div>

          {securityConfig?.allowlistEmails?.length ? (
            <div className={styles.allowlistChips}>
              {securityConfig.allowlistEmails.map((email) => (
                <div key={email} className={styles.allowlistChip}>
                  <span>{email}</span>
                  <button
                    type="button"
                    className={styles.allowlistRemove}
                    onClick={() => void handleToggleAllowEmail(email, false)}
                    disabled={updating === `security:allow:${normalizeEmail(email)}`}
                    aria-label={`Remove ${email} from whitelist`}
                    title="Remove from whitelist"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.allowlistEmpty}>
              No whitelisted emails yet. (Admins can still sign in.)
            </div>
          )}

          {ownerUid && (
            <div className={styles.ownerHint}>
              Owner admin is set {ownerUid === currentUser?.uid ? '(you)' : ''}.
            </div>
          )}
        </div>
      )}

      <div className={styles.controls}>
        <input
          type="text"
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.userTable}>
        <div className={styles.tableHeader}>
          <div className={styles.col_user}>User</div>
          <div className={styles.col_role}>Role</div>
          <div className={styles.col_status}>Status</div>
          {permissions.canEditUsers() && <div className={styles.col_actions}>Actions</div>}
        </div>

        {filteredUsers.map((user) => (
          <div key={user.uid} className={styles.tableRow}>
            <div className={styles.col_user}>
              <div className={styles.userAvatar}>
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} />
                ) : (
                  <span>{user.displayName?.[0] || user.email?.[0] || '?'}</span>
                )}
              </div>
              <div className={styles.userInfo}>
                <div className={styles.userName}>{user.displayName || 'No name'}</div>
                <div className={styles.userEmail}>{user.email}</div>
              </div>
              {user.uid === currentUser?.uid && (
                <span className={styles.youBadge}>You</span>
              )}
            </div>

            <div className={styles.col_role}>
              {permissions.canEditUsers() && user.uid !== currentUser?.uid && (!ownerUid || user.uid !== ownerUid) ? (
                <select
                  value={user.role}
                  onChange={(e) => handleRoleChange(user.uid, e.target.value as UserRole)}
                  disabled={updating === user.uid}
                  className={styles.roleSelect}
                >
                  <option value="user">User</option>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span className={styles.roleText}>{user.role}</span>
              )}
            </div>

            <div className={styles.col_status}>
              <span className={styles.statusBadge} data-status={user.status}>
                {user.status}
              </span>
            </div>

            {permissions.canEditUsers() && (
              <div className={styles.col_actions}>
                <button
                  onClick={() => setEditingUser(user)}
                  disabled={updating === user.uid}
                  className={styles.editButton}
                  title="Edit user"
                >
                  ✏️
                </button>

                {user.email && user.role !== 'admin' && (
                  <button
                    onClick={() => void handleToggleAllowEmail(user.email!, !isEmailAllowlisted(user.email))}
                    disabled={Boolean(updating?.startsWith('security:') || updating === user.uid)}
                    className={styles.toggleButton}
                    title={isEmailAllowlisted(user.email) ? 'Remove from whitelist' : 'Whitelist sign-in'}
                  >
                    {isEmailAllowlisted(user.email) ? '⭐' : '☆'}
                  </button>
                )}

                {user.uid !== currentUser?.uid && (!ownerUid || user.uid !== ownerUid) && (
                  <button
                    onClick={() => handleToggleStatus(user.uid)}
                    disabled={updating === user.uid}
                    className={styles.toggleButton}
                    title={user.status === 'active' ? 'Disable user' : 'Enable user'}
                  >
                    {user.status === 'active' ? '🚫' : '✓'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {filteredUsers.length === 0 && (
          <div className={styles.emptyState}>
            <p>No users found matching "{searchTerm}"</p>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <UserEditModal
          user={editingUser}
          ownerUid={ownerUid}
          onClose={() => setEditingUser(null)}
          onUpdate={(updatedUser) => {
            setUsers(users.map(u => u.uid === updatedUser.uid ? updatedUser : u));
            setEditingUser(null);
          }}
        />
      )}
    </div>
  );
}
