import { useState, useEffect } from 'react';
import { initializeDatabase, isDatabaseInitialized } from '@utils/database';

/**
 * Hook to initialize and track database status
 */
export function useDatabase() {
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        if (!isDatabaseInitialized()) {
          await initializeDatabase();
        }
        setIsReady(true);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize database');
        setIsReady(false);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  return { isLoading, isReady, error };
}

/**
 * Hook to detect online/offline status
 */
export function useOnline() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

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

  return isOnline;
}
