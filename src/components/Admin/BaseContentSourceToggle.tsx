import { useEffect, useMemo, useState } from 'react';
import {
  getBaseContentSourceOverride,
  resolveBaseContentSource,
  setBaseContentSourceOverride,
  type BaseContentSource,
} from '@utils/baseContentSource';
import styles from './BaseContentSourceToggle.module.css';

export function BaseContentSourceToggle() {
  const [override, setOverride] = useState<BaseContentSource | null>(getBaseContentSourceOverride());
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const resolved = useMemo(() => resolveBaseContentSource(), [override, isOnline]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const apply = (next: BaseContentSource | null) => {
    setBaseContentSourceOverride(next);
    setOverride(next);

    // Safe + simple: DB initialization strategy depends on the base source, so reload.
    window.location.reload();
  };

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <div className={styles.label}>Base content</div>
        <div className={styles.value}>
          {resolved === 'firestore' ? 'Firestore' : 'SQLite'}
          {!isOnline && <span className={styles.badge}>offline → SQLite</span>}
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={`${styles.button} ${resolved === 'sqlite' ? styles.active : ''}`}
          onClick={() => apply('sqlite')}
        >
          SQLite
        </button>
        <button
          type="button"
          className={`${styles.button} ${resolved === 'firestore' ? styles.active : ''}`}
          onClick={() => apply('firestore')}
          disabled={!isOnline}
          title={!isOnline ? 'Firestore base requires an online connection.' : undefined}
        >
          Firestore
        </button>
        <button
          type="button"
          className={styles.link}
          onClick={() => apply(null)}
          disabled={override === null}
          title={override === null ? 'No override set' : 'Clear override'}
        >
          Reset
        </button>
      </div>

      <div className={styles.hint}>
        Use Firestore to preview live/published content. SQLite remains the offline fallback.
      </div>
    </div>
  );
}
