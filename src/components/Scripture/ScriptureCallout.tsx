import { ScriptureCalloutProps } from '@/types/components';
import type { KeyboardEvent, MouseEvent } from 'react';
import styles from './Scripture.module.css';

export function ScriptureCallout({ scripture, isOnline }: ScriptureCalloutProps) {
  const url = typeof scripture.url === 'string' && scripture.url.trim() ? scripture.url.trim() : null;
  const isClickable = Boolean(url) && isOnline;

  const open = () => {
    if (!isClickable || !url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleClick = (e: MouseEvent) => {
    if (!isClickable) return;
    e.preventDefault();
    open();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isClickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  return (
    <blockquote
      className={`${styles.scriptureCallout} ${styles[scripture.source]} ${isClickable ? styles.clickable : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={isClickable ? 'link' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={
        isClickable
          ? `Open ${scripture.reference}`
          : `Scripture reference: ${scripture.reference}`
      }
      title={
        isClickable
          ? `Open ${scripture.reference}`
          : url
            ? 'Link unavailable offline'
            : undefined
      }
    >
      <div className={styles.scriptureReference}>
        <span>{scripture.reference}</span>
        {url && (
          <span
            className={`${styles.scriptureLink} ${!isOnline ? styles.offline : ''}`}
            aria-hidden="true"
          >
            {isOnline ? '🔗' : '🔌'}
            {!isOnline && <span className={styles.offlineIcon}>(offline)</span>}
          </span>
        )}
      </div>
      {scripture.text && <p className={styles.scriptureText}>{scripture.text}</p>}
    </blockquote>
  );
}
