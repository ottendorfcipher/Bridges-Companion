import { TabBarProps } from '@/types/components';
import { ContentItemIcon } from '@components/ContentItemIcon/ContentItemIcon';
import styles from './TabBar.module.css';

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className={styles.tabBar} role="tablist" aria-label="Main navigation">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            className={`${styles.tabItem} ${isActive ? styles.active : ''}`}
            onClick={() => onTabChange(tab.id)}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            aria-controls={`panel-${tab.id}`}
          >
            <span className={styles.tabIcon}>
              <ContentItemIcon
                iconType={tab.iconType}
                icon={tab.icon}
                iconUrl={tab.iconUrl}
                size={28}
                ariaLabel=""
              />
            </span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
