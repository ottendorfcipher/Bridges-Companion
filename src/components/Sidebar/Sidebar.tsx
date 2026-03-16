import { TabBarProps } from '@/types/components';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { ContentItemIcon } from '@components/ContentItemIcon/ContentItemIcon';
import { Icon } from '../Icon/Icon';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { UserProfile } from '../Auth/UserProfile';
import { EditModeToggle } from '../EditModeToggle/EditModeToggle';
import styles from './Sidebar.module.css';

/**
 * Sidebar component for desktop navigation
 * Replaces tab bar on screens >= 1024px
 * Updated: Learning Guide subtitle
 */
export function Sidebar({ tabs, activeTab, onTabChange, onAdminClick }: TabBarProps & { onAdminClick?: () => void }) {
  const { user } = useAuth();
  const permissions = usePermissions();
  
  return (
    <nav className={styles.sidebar} aria-label="Main navigation">
      <div className={styles.topBar}>
        <ThemeToggle variant="button" />
        <EditModeToggle />
      </div>
      
      <button className={styles.brand} onClick={() => onTabChange(null)} aria-label="Return to home">
        <div className={styles.brandIcon}>
          <img 
            src="/images/bridges_light_main_icon.png" 
            alt="Bridge Companion"
            className={styles.logoLight}
          />
          <img 
            src="/images/bridges_dark_main_icon.png" 
            alt="Bridge Companion"
            className={styles.logoDark}
          />
        </div>
        <h2 className={styles.brandTitle}>Bridge Companion</h2>
        <p className={styles.brandSubtitle}>Learning Guide</p>
      </button>

      <div className={styles.nav}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const hasEdits = (tab as any).hasEdits || false;
          
          return (
            <button
              key={tab.id}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={styles.navIcon}>
                <ContentItemIcon
                  iconType={tab.iconType}
                  icon={tab.icon}
                  iconUrl={tab.iconUrl}
                  size={24}
                  ariaLabel={tab.label}
                />
              </span>
              <span className={styles.navLabel}>{tab.label}</span>
              {hasEdits && <span className={styles.editIndicator} title="Has edited content" />}
            </button>
          );
        })}
        
        {/* Saved items - utility navigation */}
        <div className={styles.utilityNav}>
          <button
            className={`${styles.navItem} ${activeTab === 'bookmarks' ? styles.active : ''}`}
            onClick={() => onTabChange('bookmarks')}
            aria-current={activeTab === 'bookmarks' ? 'page' : undefined}
            title="View saved pages for review"
          >
            <span className={styles.navIcon}>
              <Icon name="bookmark" size={24} />
            </span>
            <span className={styles.navLabel}>Saved for Review</span>
          </button>
        </div>
      </div>

      {/* Admin Access Button */}
      {permissions.canAccessAdmin() && onAdminClick && (
        <div className={styles.adminSection}>
          <button
            className={styles.adminButton}
            onClick={onAdminClick}
            title="Admin Panel"
          >
            <span className={styles.navIcon}>
              <Icon name="settings" size={20} />
            </span>
            <span>Admin Panel</span>
          </button>
        </div>
      )}

      {/* User Profile Section */}
      {user && (
        <div className={styles.userSection}>
          <UserProfile user={user} />
        </div>
      )}

      <div className={styles.footer}>
        <p className={styles.footerText}>
          For Bahrain Cultural Learning Experience
        </p>
      </div>
    </nav>
  );
}
