import { ReactNode, useState } from 'react';
import { useAuth } from '@hooks/useAuth';
import { signOut } from '@utils/auth';
import styles from './AdminLayout.module.css';

interface AdminLayoutProps {
  children: ReactNode;
  activeView: 'users' | 'logs' | 'versions' | 'assignments' | 'content';
  onNavigate: (view: 'users' | 'logs' | 'versions' | 'assignments' | 'content') => void;
  onBackToApp: () => void;
}

/**
 * AdminLayout - Main admin panel shell with sidebar
 * Following Apple HIG design patterns
 */
export function AdminLayout({ children, activeView, onNavigate, onBackToApp }: AdminLayoutProps) {
  const { user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };
  
  const handleNavigation = (view: 'users' | 'logs' | 'versions' | 'assignments' | 'content') => {
    onNavigate(view);
    setIsMobileMenuOpen(false); // Close mobile menu after navigation
  };

  return (
    <div className={styles.container}>
      {/* Mobile Header */}
      <header className={styles.mobileHeader}>
        <button 
          className={styles.mobileMenuButton}
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Menu"
        >
          ☰
        </button>
        <h1 className={styles.mobileTitle}>Admin Panel</h1>
        <button className={styles.mobileBackButton} onClick={onBackToApp} aria-label="Back">
          ←
        </button>
      </header>

      {/* Admin Sidebar - Desktop + Mobile Overlay */}
      <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.mobileMenuOpen : ''}`}>
        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className={styles.mobileMenuOverlay} onClick={() => setIsMobileMenuOpen(false)} />
        )}
        
        <div className={styles.sidebarContent}>
          <div className={styles.header}>
            <div className={styles.brandIcon}>⚙️</div>
            <h1 className={styles.title}>Admin Panel</h1>
            <p className={styles.subtitle}>Bridge Companion</p>
          </div>

          <nav className={styles.nav}>
            <button
              className={`${styles.navItem} ${activeView === 'users' ? styles.active : ''}`}
              onClick={() => handleNavigation('users')}
            >
              <span className={styles.navIcon}>👥</span>
              <span className={styles.navLabel}>Users</span>
            </button>

            <button
              className={`${styles.navItem} ${activeView === 'logs' ? styles.active : ''}`}
              onClick={() => handleNavigation('logs')}
            >
              <span className={styles.navIcon}>📋</span>
              <span className={styles.navLabel}>Activity Logs</span>
            </button>

            <button
              className={`${styles.navItem} ${activeView === 'versions' ? styles.active : ''}`}
              onClick={() => handleNavigation('versions')}
            >
              <span className={styles.navIcon}>📦</span>
              <span className={styles.navLabel}>Versions</span>
            </button>

            <button
              className={`${styles.navItem} ${activeView === 'assignments' ? styles.active : ''}`}
              onClick={() => handleNavigation('assignments')}
            >
              <span className={styles.navIcon}>🏷️</span>
              <span className={styles.navLabel}>Assignments</span>
            </button>

            <button
              className={`${styles.navItem} ${activeView === 'content' ? styles.active : ''}`}
              onClick={() => handleNavigation('content')}
            >
              <span className={styles.navIcon}>📝</span>
              <span className={styles.navLabel}>Content</span>
            </button>
          </nav>

          <div className={styles.footer}>
            <button className={styles.backButton} onClick={onBackToApp}>
              <span className={styles.backIcon}>←</span>
              <span>Back to App</span>
            </button>

            {user && (
              <div className={styles.userInfo}>
                <div className={styles.userAvatar}>
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'User'} />
                  ) : (
                    <span>{user.displayName?.[0] || user.email?.[0] || '?'}</span>
                  )}
                </div>
                <div className={styles.userDetails}>
                  <div className={styles.userName}>{user.displayName || user.email}</div>
                  <div className={styles.userRole}>{user.role}</div>
                </div>
                <button className={styles.signOutButton} onClick={handleSignOut} title="Sign out">
                  <span>↗</span>
                </button>
              </div>
            )}

            <div className={styles.copyright}>
              © 2025 Gabe Smith & Nick Weiner
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.main}>{children}</main>
    </div>
  );
}
