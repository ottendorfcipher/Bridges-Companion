import { useState } from 'react';
import { AccordionProps } from '@/types/components';
import { AccordionItem } from './AccordionItem';
import styles from './Accordion.module.css';

/**
 * Accordion Component - Layer 1 Core Changes
 * 
 * Progressive Disclosure Pattern (Cognitive Load Theory)
 * - The Rule of 5: Maximum 5 items visible without "Show More" interaction
 * - Auto-collapse: Only one section open at a time (Miller's Law: 7±2 items)
 * - 44pt minimum touch target per Apple HIG
 * - Chevron indicator for affordance
 * 
 * From core_changes_ui_12_28_25.pdf - Chunk & Prioritize strategy
 */

const RULE_OF_5_LIMIT = 5;

export function Accordion({
  items,
  allowMultiple = false,
  defaultExpanded = [],
  variant = 'default',
}: AccordionProps) {
  const [expanded, setExpanded] = useState<number[]>(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  const handleToggle = (id: number) => {
    // Layer 1: Default behavior - only one section open at a time (auto-collapse others)
    if (allowMultiple) {
      setExpanded(prev => 
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    } else {
      // Single-open behavior per Layer 1 spec
      setExpanded(prev => prev.includes(id) ? [] : [id]);
    }
  };

  // Layer 1 Rule of 5: Progressive disclosure for cognitive load management
  const visibleItems = showAll || items.length <= RULE_OF_5_LIMIT 
    ? items 
    : items.slice(0, RULE_OF_5_LIMIT);
  
  const hasMore = items.length > RULE_OF_5_LIMIT;

  return (
    <div className={`${styles.accordion} ${variant === 'compact' ? styles.compact : ''}`.trim()}>
      {visibleItems.map((item) => (
        <AccordionItem
          key={item.id}
          id={item.id}
          title={item.title}
          content={item.content}
          summary={item.summary}
          isExpanded={expanded.includes(item.id)}
          onToggle={handleToggle}
          onExpand={item.onExpand}
          categorySlug={item.categorySlug}
          sectionTitle={item.sectionTitle}
        />
      ))}
      
      {/* Layer 1 Rule of 5: Show More button */}
      {hasMore && !showAll && (
        <button 
          className={styles.showMoreButton}
          onClick={() => setShowAll(true)}
          aria-label={`Show ${items.length - RULE_OF_5_LIMIT} more items`}
        >
          Show More ({items.length - RULE_OF_5_LIMIT} more)
        </button>
      )}
      
      {hasMore && showAll && (
        <button 
          className={styles.showMoreButton}
          onClick={() => setShowAll(false)}
          aria-label="Show less"
        >
          Show Less
        </button>
      )}
    </div>
  );
}
