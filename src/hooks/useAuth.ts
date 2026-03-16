import { useContext } from 'react';
import AuthContext, { AuthContextValue } from '@contexts/AuthContext';

/**
 * Hook to access authentication context
 * 
 * @returns AuthContextValue - Current auth state (user, loading, error)
 * @throws Error if used outside of AuthProvider
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, loading, error } = useAuth();
 *   
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error}</div>;
 *   if (!user) return <div>Not authenticated</div>;
 *   
 *   return <div>Welcome {user.displayName}</div>;
 * }
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
