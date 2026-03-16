import { useState, useEffect } from 'react';
import { Icon } from '../Icon/Icon';
import { toggleBookmark, isBookmarked } from '@utils/bookmarks';
import { useAuth } from '@hooks/useAuth';
import { trackBookmark } from '@utils/userActionTracker';
import styles from './BookmarkButton.module.css';

interface BookmarkButtonProps {
  sectionId: number;
  categorySlug: string;
  sectionTitle: string;
  variant?: 'default' | 'compact';
}

/**
 * BookmarkButton - "Review Later" functionality for spaced repetition
 */
export function BookmarkButton({ 
  sectionId, 
  categorySlug, 
  sectionTitle,
  variant = 'default'
}: BookmarkButtonProps) {
  const { user } = useAuth();
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    setBookmarked(isBookmarked(sectionId));
  }, [sectionId]);

  const handleToggle = () => {
    const newState = toggleBookmark({
      sectionId,
      categorySlug,
      sectionTitle
    });
    setBookmarked(newState);
    
    // Track bookmark action
    trackBookmark(user, newState ? 'add' : 'remove', sectionId, sectionTitle);
  };

  return (
    <button
      className={`${styles.bookmarkButton} ${bookmarked ? styles.bookmarked : ''} ${styles[variant]}`}
      onClick={handleToggle}
      aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
      title={bookmarked ? 'Remove from Review Later' : 'Save for Review Later'}
    >
      <Icon name={bookmarked ? 'bookmark-filled' : 'bookmark'} size={variant === 'compact' ? 20 : 24} />
      {variant === 'default' && (
        <span className={styles.label}>
          {bookmarked ? 'Saved' : 'Review Later'}
        </span>
      )}
    </button>
  );
}
