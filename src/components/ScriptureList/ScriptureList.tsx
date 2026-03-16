import { LegacyScripture } from '@/types/database';
import { ScriptureCallout } from '../Scripture/ScriptureCallout';
import { useState, useEffect } from 'react';
import styles from './ScriptureList.module.css';

interface ScriptureListProps {
  scriptures: LegacyScripture[];
  title?: string;
}

/**
 * ScriptureList - Displays related scripture references for a page
 * 
 * Shows scripture references as a separate section below the main content
 * following Layer 1 architecture (content and references separated)
 */
export function ScriptureList({ scriptures, title = 'Scripture References' }: ScriptureListProps) {
  // Check if online (simplified version)
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!scriptures || scriptures.length === 0) {
    return null;
  }

  return (
    <div className={styles.scriptureList}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.references}>
        {scriptures.map((scripture) => (
          <ScriptureCallout 
            key={scripture.id} 
            scripture={scripture} 
            isOnline={isOnline} 
          />
        ))}
      </div>
    </div>
  );
}
