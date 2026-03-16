import { PageSummary } from '@/types/layer1';
import styles from './PageNavigation.module.css';

export interface PageNavigationProps {
  previousPage?: PageSummary;
  nextPage?: PageSummary;
  moduleSlug: string;
  moduleTitle: string;
  onNavigate: (slug: string) => void;
  onBackToModule: () => void;
}

/**
 * PageNavigation - Layer 1 Navigation Component
 * 
 * From 00-architecture.md:
 * - Next / Previous buttons move within a module
 * - "Back to Module Overview" available on every page
 * - Reading paths jump users non-linearly (handled separately)
 */
export function PageNavigation({
  previousPage,
  nextPage,
  moduleSlug: _moduleSlug,
  moduleTitle,
  onNavigate,
  onBackToModule
}: PageNavigationProps) {
  return (
    <div className={styles.pageNavigation}>
      {/* Back to Module Overview - Always available */}
      <div className={styles.backToModule}>
        <button
          className={styles.backButton}
          onClick={onBackToModule}
          aria-label={`Back to ${moduleTitle} overview`}
        >
          <svg className={styles.backIcon} width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path 
              d="M12 4l-6 6 6 6" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
          <span>Back to {moduleTitle}</span>
        </button>
      </div>

      {/* Previous / Next Navigation within module */}
      <div className={styles.prevNextNav}>
        {previousPage ? (
          <button
            className={`${styles.navButton} ${styles.previous}`}
            onClick={() => onNavigate(previousPage.slug)}
            aria-label={`Previous: ${previousPage.title}`}
          >
            <svg className={styles.navIcon} width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path 
                d="M12 4l-6 6 6 6" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
            <div className={styles.navContent}>
              <span className={styles.navLabel}>Previous</span>
              <span className={styles.navTitle}>{previousPage.title}</span>
            </div>
          </button>
        ) : (
          <div className={styles.navSpacer} />
        )}

        {nextPage ? (
          <button
            className={`${styles.navButton} ${styles.next}`}
            onClick={() => onNavigate(nextPage.slug)}
            aria-label={`Next: ${nextPage.title}`}
          >
            <div className={styles.navContent}>
              <span className={styles.navLabel}>Next</span>
              <span className={styles.navTitle}>{nextPage.title}</span>
            </div>
            <svg className={styles.navIcon} width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path 
                d="M8 4l6 6-6 6" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <div className={styles.navSpacer} />
        )}
      </div>
    </div>
  );
}
