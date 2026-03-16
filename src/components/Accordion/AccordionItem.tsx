import { AccordionItemProps } from '@/types/components';
import { BookmarkButton } from '../BookmarkButton/BookmarkButton';
import { AssignedTagPicker } from '@components/AssignedTags/AssignedTagPicker';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { trackAccordion } from '@utils/userActionTracker';
import styles from './Accordion.module.css';

/**
 * AccordionItem - Layer 1 Specifications
 * 
 * - Full width button with min-height 44pt (Apple HIG minimum touch target)
 * - 1px hairline separator
 * - Chevron indicator on right
 * - Auto-collapse behavior (only one open at a time)
 * 
 * From core_changes_ui_12_28_25.pdf
 */
export function AccordionItem({ 
  id, 
  title, 
  content, 
  summary,
  isExpanded, 
  onToggle,
  onExpand,
  categorySlug,
  sectionTitle
}: AccordionItemProps) {
  const { user } = useAuth();
  const permissions = usePermissions();

  const resolvedSectionTitle = sectionTitle || (typeof title === 'string' ? title : 'Untitled');
  
  const handleToggle = () => {
    // Track accordion action
    const titleText = typeof title === 'string' ? title : resolvedSectionTitle;
    trackAccordion(user, isExpanded ? 'collapse' : 'expand', id, titleText);
    
    // Call onExpand when expanding (not collapsing)
    if (!isExpanded && onExpand) {
      onExpand();
    }
    onToggle(id);
  };

  return (
    <div className={`${styles.accordionItem} ${isExpanded ? styles.expanded : ''}`}>
      <button 
        className={styles.accordionHeader}
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-controls={`accordion-content-${id}`}
        id={`accordion-header-${id}`}
      >
        <div className={styles.accordionHeaderContent}>
          <div className={styles.accordionTitle}>{title}</div>
          {summary && !isExpanded && (
            <div className={styles.accordionSummary}>{summary}</div>
          )}
        </div>
        {/* Layer 1: Chevron indicator on right */}
        <svg 
          className={styles.accordionChevron}
          width="20" 
          height="20" 
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path 
            d="M7 5l5 5-5 5" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
      </button>
      
      <div 
        className={styles.accordionContent}
        id={`accordion-content-${id}`}
        aria-labelledby={`accordion-header-${id}`}
        role="region"
      >
        <div className={styles.accordionBody}>
          {content}
          {categorySlug && (
            <div className={styles.accordionFooter}>
              <BookmarkButton 
                sectionId={id}
                categorySlug={categorySlug}
                sectionTitle={resolvedSectionTitle}
                variant="compact"
              />
              {permissions.isAdmin() && (
                <AssignedTagPicker
                  sectionId={id}
                  categorySlug={categorySlug}
                  sectionTitle={resolvedSectionTitle}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
