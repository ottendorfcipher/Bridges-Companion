import { Breadcrumb as BreadcrumbType } from '@/types/layer1';
import styles from './Breadcrumb.module.css';

export interface BreadcrumbProps {
  breadcrumbs: BreadcrumbType[];
  onNavigate?: (slug: string, type: string) => void;
}

/**
 * Breadcrumb - Layer 1 Navigation Component
 * 
 * Format (Desktop): Section > Module > Page
 * Format (Mobile): Module > Page
 * 
 * Rules from 00-architecture.md:
 * - Section = Category (Learn, Compare, Practice, Language, Reference)
 * - Module = Grouped content (e.g., "Islam Basics", "Scripture and Authority")
 * - Page = Individual content page
 * 
 * Examples:
 * - Learn > Islam Basics > The Five Pillars
 * - Compare > Scripture and Interpretation Across Traditions > The Gospel in the Qur'an
 * - Practice > Navigating Faith Conversations > Knowing When to Pause
 */
export function Breadcrumb({ breadcrumbs, onNavigate }: BreadcrumbProps) {
  if (breadcrumbs.length === 0) return null;

  const handleClick = (crumb: BreadcrumbType, index: number) => {
    // Don't allow clicking the last breadcrumb (current page)
    if (index === breadcrumbs.length - 1) return;
    
    if (onNavigate && crumb.slug) {
      onNavigate(crumb.slug, crumb.type);
    }
  };

  return (
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      <ol className={styles.breadcrumbList}>
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const isFirst = index === 0;
          
          // Hide category (first item) on mobile per Layer 1 spec
          const mobileHidden = isFirst;

          return (
            <li 
              key={`${crumb.type}-${crumb.label}`}
              className={`${styles.breadcrumbItem} ${mobileHidden ? styles.hideOnMobile : ''}`}
            >
              {index > 0 && (
                <span className={styles.separator} aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path 
                      d="M6 4l4 4-4 4" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
              
              {isLast || !crumb.slug ? (
                <span className={styles.breadcrumbCurrent} aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <button
                  className={styles.breadcrumbLink}
                  onClick={() => handleClick(crumb, index)}
                  aria-label={`Navigate to ${crumb.label}`}
                >
                  {crumb.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
