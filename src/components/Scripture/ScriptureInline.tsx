import { ScriptureInlineProps } from '@/types/components';
import styles from './Scripture.module.css';

export function ScriptureInline({ scripture, isOnline }: ScriptureInlineProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (!isOnline) {
      e.preventDefault();
      return;
    }
    
    if (scripture.url) {
      window.open(scripture.url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!scripture.url) {
    return <span className={styles.scriptureInline}>{scripture.reference}</span>;
  }

  return (
    <a
      href={scripture.url}
      className={`${styles.scriptureInline} ${!isOnline ? styles.offline : ''}`}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Read ${scripture.reference} ${isOnline ? 'online' : '(offline)'}`}
      title={isOnline ? `Open ${scripture.reference}` : 'Link unavailable offline'}
    >
      {scripture.reference}
      {!isOnline && ' 🔌'}
    </a>
  );
}
