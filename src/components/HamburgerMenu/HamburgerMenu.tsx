import { useEffect } from 'react';
import { TabBarProps } from '@/types/components';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { ContentItemIcon } from '@components/ContentItemIcon/ContentItemIcon';
import { Icon } from '../Icon/Icon';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { UserProfile } from '../Auth/UserProfile';
import styles from './HamburgerMenu.module.css';

interface HamburgerMenuProps extends TabBarProps {
  isOpen: boolean;
  onClose: () => void;
  onAdminClick?: () => void;
}

/**
 * Mobile hamburger menu with slide-out drawer
 * Provides category navigation on mobile devices
 */
export function HamburgerMenu({ tabs, activeTab, onTabChange, isOpen, onClose, onAdminClick }: HamburgerMenuProps) {
  const { user } = useAuth();
  const permissions = usePermissions();
  
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleTabClick = (tabId: string) => {
    onTabChange(tabId);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`${styles.backdrop} ${isOpen ? styles.backdropOpen : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <nav 
        className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`}
        aria-label="Main navigation"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className={styles.header}>
          <button 
            className={styles.brand}
            onClick={() => {
              onTabChange(null);
              onClose();
            }}
            aria-label="Return to home"
          >
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
            <div>
              <h2 className={styles.brandTitle}>Bridge Companion</h2>
              <p className={styles.brandSubtitle}>Learning Guide</p>
            </div>
          </button>
          <button 
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close menu"
          >
            <Icon name="x" size={24} />
          </button>
        </div>

        {/* Navigation */}
        <div className={styles.nav}>
          <div className={styles.themeToggleItem}>
            <ThemeToggle variant="inline" />
          </div>
          
          <div className={styles.navDivider} />
          
          <button
            className={`${styles.navItem} ${activeTab === 'home' ? styles.active : ''}`}
            onClick={() => {
              onTabChange('home');
              onClose();
            }}
          >
            <span className={styles.navIcon}>
              <Icon name="compass" size={24} />
            </span>
            <span className={styles.navLabel}>Home</span>
          </button>
          
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const hasEdits = (tab as any).hasEdits || false;
            
            return (
              <button
                key={tab.id}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                onClick={() => handleTabClick(tab.id)}
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
          
          <div className={styles.navDivider} />
          
          <button
            className={`${styles.navItem} ${activeTab === 'bookmarks' ? styles.active : ''}`}
            onClick={() => handleTabClick('bookmarks')}
            aria-current={activeTab === 'bookmarks' ? 'page' : undefined}
          >
            <span className={styles.navIcon}>
              <Icon name="bookmark" size={24} />
            </span>
            <span className={styles.navLabel}>Saved for Review</span>
          </button>
          
          {/* Admin Panel Link */}
          {permissions.canAccessAdmin() && onAdminClick && (
            <>
              <div className={styles.navDivider} />
              <button
                className={styles.navItem}
                onClick={() => {
                  onAdminClick();
                  onClose();
                }}
              >
                <span className={styles.navIcon}>
                  <Icon name="settings" size={24} />
                </span>
                <span className={styles.navLabel}>Admin Panel</span>
              </button>
            </>
          )}
        </div>

        {/* User Profile Section */}
        {user && (
          <div className={styles.userSection}>
            <UserProfile user={user} />
          </div>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          <p className={styles.footerText}>
            For Bahrain Cultural Learning Experience
          </p>
        </div>
      </nav>
    </>
  );
}
