import { useState, useEffect } from 'react';
import { useAuth } from '@hooks/useAuth';
import { getAllUsers } from '@utils/userProfile';
import type { User } from '@/types/user';
import styles from './Dashboard.module.css';

/**
 * Dashboard - Admin panel home page
 * Shows overview statistics and quick actions
 */
export function Dashboard() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
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

  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.status === 'active').length,
    admins: users.filter((u) => u.role === 'admin').length,
    editors: users.filter((u) => u.role === 'editor').length,
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Dashboard</h1>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Dashboard</h1>
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠️</span>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Welcome back, {currentUser?.displayName || currentUser?.email}</p>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>👥</div>
          <div className={styles.statValue}>{stats.totalUsers}</div>
          <div className={styles.statLabel}>Total Users</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>✓</div>
          <div className={styles.statValue}>{stats.activeUsers}</div>
          <div className={styles.statLabel}>Active Users</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>⚙️</div>
          <div className={styles.statValue}>{stats.admins}</div>
          <div className={styles.statLabel}>Admins</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>✏️</div>
          <div className={styles.statValue}>{stats.editors}</div>
          <div className={styles.statLabel}>Editors</div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent Users</h2>
        <div className={styles.userList}>
          {users.slice(0, 5).map((user) => (
            <div key={user.uid} className={styles.userItem}>
              <div className={styles.userAvatar}>
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} />
                ) : (
                  <span>{user.displayName?.[0] || user.email?.[0] || '?'}</span>
                )}
              </div>
              <div className={styles.userInfo}>
                <div className={styles.userName}>{user.displayName || user.email}</div>
                <div className={styles.userMeta}>
                  <span className={styles.userRole}>{user.role}</span>
                  <span className={styles.userStatus} data-status={user.status}>
                    {user.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
