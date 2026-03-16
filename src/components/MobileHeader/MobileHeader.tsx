import { Icon } from '../Icon/Icon';
import { EditModeToggle } from '../EditModeToggle/EditModeToggle';
import styles from './MobileHeader.module.css';

interface MobileHeaderProps {
  onMenuClick: () => void;
  title?: string;
}

/**
 * Mobile header with hamburger menu button
 * Only visible on mobile/tablet screens
 */
export function MobileHeader({ onMenuClick, title = 'Bridge Companion' }: MobileHeaderProps) {
  return (
    <header className={styles.header}>
      <button 
        className={styles.menuButton}
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Icon name="menu" size={24} />
      </button>
      
      <h1 className={styles.title}>{title}</h1>
      
      {/* Edit Mode Toggle - Top Right */}
      <div className={styles.toggleContainer}>
        <EditModeToggle />
      </div>
    </header>
  );
}
