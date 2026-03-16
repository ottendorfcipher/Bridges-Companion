import { logActivity, type ActivityAction, type ActivityLog } from './activityLog';

/**
 * User Action Tracker - Lightweight observability for user interactions
 * Features:
 * - Batching: Reduces Firestore writes
 * - Debouncing: Prevents spam from rapid actions
 * - Privacy: Only logs authenticated user data
 */

// Batch configuration
const BATCH_INTERVAL = 5000; // 5 seconds
const MAX_BATCH_SIZE = 20;

// Debounce configuration (for high-frequency events)
const DEBOUNCE_ACTIONS: Set<ActivityAction> = new Set([
  'accordion_expand',
  'accordion_collapse',
]);
const DEBOUNCE_DELAY = 1000; // 1 second

// Batch queue
let actionQueue: Array<{
  userId: string;
  userEmail: string;
  userName: string;
  action: ActivityAction;
  options: {
    resourceType?: ActivityLog['resourceType'];
    resourceId?: number | string;
    resourceName?: string;
    field?: ActivityLog['field'];
    oldValue?: string;
    newValue?: string;
    metadata?: Record<string, any>;
    contentEditId?: string;
    undoable?: boolean;
  };
}> = [];

// Debounce timers
const debounceTimers: Map<string, NodeJS.Timeout> = new Map();

// Batch timer
let batchTimer: NodeJS.Timeout | null = null;

/**
 * Track a user action
 * @param user - Authenticated user object
 * @param action - Action type
 * @param options - Additional tracking data
 */
export async function trackUserAction(
  user: { uid: string; email: string | null; displayName: string | null } | null,
  action: ActivityAction,
  options: {
    resourceType?: ActivityLog['resourceType'];
    resourceId?: number | string;
    resourceName?: string;
    field?: ActivityLog['field'];
    oldValue?: string;
    newValue?: string;
    metadata?: Record<string, any>;
    contentEditId?: string;
    undoable?: boolean;
    immediate?: boolean; // Skip batching
  } = {}
): Promise<void> {
  // Don't track if user is not authenticated
  if (!user) {
    return;
  }

  const userId = user.uid;
  const userEmail = user.email || 'unknown@example.com';
  const userName = user.displayName || user.email || 'Unknown User';

  // Handle immediate logging (for critical actions)
  if (options.immediate) {
    const { immediate, ...logOptions } = options;
    await logActivity(userId, userEmail, userName, action, logOptions);
    return;
  }

  // Handle debounced actions
  if (DEBOUNCE_ACTIONS.has(action)) {
    const debounceKey = `${action}-${options.resourceId || 'global'}`;
    
    // Clear existing timer
    const existingTimer = debounceTimers.get(debounceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      addToQueue(userId, userEmail, userName, action, options);
      debounceTimers.delete(debounceKey);
    }, DEBOUNCE_DELAY);

    debounceTimers.set(debounceKey, timer);
    return;
  }

  // Add to batch queue
  addToQueue(userId, userEmail, userName, action, options);
}

/**
 * Add action to batch queue
 */
function addToQueue(
  userId: string,
  userEmail: string,
  userName: string,
  action: ActivityAction,
  options: {
    resourceType?: ActivityLog['resourceType'];
    resourceId?: number | string;
    resourceName?: string;
    field?: ActivityLog['field'];
    oldValue?: string;
    newValue?: string;
    metadata?: Record<string, any>;
    contentEditId?: string;
    undoable?: boolean;
    immediate?: boolean;
  }
): void {
  const { immediate, ...logOptions } = options as any;
  
  actionQueue.push({
    userId,
    userEmail,
    userName,
    action,
    options: logOptions,
  });

  // Flush if batch is full
  if (actionQueue.length >= MAX_BATCH_SIZE) {
    flushQueue();
    return;
  }

  // Start batch timer if not already running
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      flushQueue();
    }, BATCH_INTERVAL);
  }
}

/**
 * Flush the action queue to Firestore
 */
async function flushQueue(): Promise<void> {
  if (actionQueue.length === 0) {
    return;
  }

  // Clear timer
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  // Get actions to log
  const actionsToLog = [...actionQueue];
  actionQueue = [];

  // Log all actions
  const promises = actionsToLog.map(({ userId, userEmail, userName, action, options }) =>
    logActivity(userId, userEmail, userName, action, options).catch((error) => {
      console.error('Failed to log action:', action, error);
    })
  );

  await Promise.all(promises);
}

/**
 * Manually flush the queue (useful for logout or page unload)
 */
export async function flushTracking(): Promise<void> {
  // Clear all debounce timers
  debounceTimers.forEach((timer) => clearTimeout(timer));
  debounceTimers.clear();

  // Flush queue
  await flushQueue();
}

/**
 * Helper functions for common tracking scenarios
 */

export function trackNavigation(
  user: Parameters<typeof trackUserAction>[0],
  destination: 'home' | 'category' | 'section' | 'bookmarks' | 'admin',
  resourceName?: string,
  resourceId?: number | string
): void {
  const actionMap: Record<typeof destination, ActivityAction> = {
    home: 'navigate_home',
    category: 'navigate_category',
    section: 'navigate_section',
    bookmarks: 'navigate_bookmarks',
    admin: 'navigate_admin',
  };

  trackUserAction(user, actionMap[destination], {
    resourceName,
    resourceId,
    metadata: { destination },
  });
}

export function trackAuth(
  user: Parameters<typeof trackUserAction>[0],
  action: 'login' | 'logout'
): void {
  trackUserAction(
    user,
    action === 'login' ? 'user_login' : 'user_logout',
    { immediate: true } // Auth events should be logged immediately
  );
}

export function trackBookmark(
  user: Parameters<typeof trackUserAction>[0],
  action: 'add' | 'remove',
  sectionId: number,
  sectionTitle: string
): void {
  trackUserAction(user, action === 'add' ? 'bookmark_add' : 'bookmark_remove', {
    resourceType: 'bookmark',
    resourceId: sectionId,
    resourceName: sectionTitle,
  });
}

export function trackAccordion(
  user: Parameters<typeof trackUserAction>[0],
  action: 'expand' | 'collapse',
  sectionId: number,
  sectionTitle: string
): void {
  trackUserAction(
    user,
    action === 'expand' ? 'accordion_expand' : 'accordion_collapse',
    {
      resourceType: 'section',
      resourceId: sectionId,
      resourceName: sectionTitle,
    }
  );
}

export function trackSearch(
  user: Parameters<typeof trackUserAction>[0],
  searchQuery: string
): void {
  trackUserAction(user, 'search_performed', {
    metadata: { query: searchQuery },
  });
}

export function trackThemeToggle(
  user: Parameters<typeof trackUserAction>[0],
  newTheme: 'light' | 'dark' | 'auto'
): void {
  trackUserAction(user, 'theme_toggle', {
    metadata: { theme: newTheme },
  });
}

export function trackUserManagement(
  user: Parameters<typeof trackUserAction>[0],
  action: 'role_change' | 'status_change',
  targetUserId: string,
  targetUserName: string,
  field: 'role' | 'status',
  oldValue: string,
  newValue: string
): void {
  trackUserAction(
    user,
    action === 'role_change' ? 'user_role_change' : 'user_status_change',
    {
      resourceType: 'user',
      resourceId: targetUserId,
      resourceName: targetUserName,
      field,
      oldValue,
      newValue,
      immediate: true, // Admin actions should be logged immediately
    }
  );
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushTracking();
  });
}
