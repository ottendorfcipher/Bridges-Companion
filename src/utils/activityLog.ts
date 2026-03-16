import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp,
  doc,
  setDoc,
} from 'firebase/firestore';
import { firestore } from '@config/firebase';
import { deleteDoc } from 'firebase/firestore';
import type { QueryResult } from '@/types/database';

/**
 * Activity log entry for tracking user actions
 */
export type ActivityAction = 
  // Content editing actions
  | 'edit_content' | 'edit_title' | 'edit_purpose'
  // Navigation actions
  | 'navigate_home' | 'navigate_category' | 'navigate_section' | 'navigate_bookmarks' | 'navigate_admin'
  // Authentication actions
  | 'user_login' | 'user_logout'
  // Bookmark actions
  | 'bookmark_add' | 'bookmark_remove'
  // Search actions
  | 'search_performed'
  // UI interaction actions
  | 'accordion_expand' | 'accordion_collapse' | 'theme_toggle'
  // Admin actions
  | 'user_role_change' | 'user_status_change' | 'admin_panel_access'
  // Security (admin)
  | 'security_lockdown_toggle' | 'security_allowlist_update'
  // CMS (draft overlays)
  | 'catalog_category_create' | 'catalog_category_update' | 'catalog_category_hide' | 'catalog_category_unhide' | 'catalog_category_delete' | 'catalog_category_restore'
  | 'catalog_module_create' | 'catalog_module_update' | 'catalog_module_hide' | 'catalog_module_unhide' | 'catalog_module_delete' | 'catalog_module_restore'
  | 'catalog_page_create' | 'catalog_page_update' | 'catalog_page_hide' | 'catalog_page_unhide' | 'catalog_page_delete' | 'catalog_page_restore'
  // Assignments (admin)
  | 'assignments_tag_saved'
  // Versioning (admin)
  | 'version_published'
  | 'version_set_live'
  | 'version_removed'
  | 'version_reset_base';

export interface ActivityLog {
  id?: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: ActivityAction;
  resourceType?: 'page' | 'module' | 'section' | 'category' | 'version' | 'bookmark' | 'user' | 'tag'; // Optional for non-resource actions
  resourceId?: number | string; // Optional, can be string for user IDs
  resourceName?: string; // Optional
  field?: 'title' | 'content' | 'purpose' | 'role' | 'status'; // Optional
  oldValue?: string; // Optional
  newValue?: string; // Optional
  metadata?: Record<string, any>; // Additional context (e.g., search query, category slug)
  contentEditId?: string; // Link to contentEdits document
  timestamp: string | Timestamp;
  undoable?: boolean; // Most actions aren't undoable
  undone?: boolean;
}

/**
 * Log a user activity to Firestore
 * @param userId - User ID
 * @param userEmail - User email
 * @param userName - User display name
 * @param action - Type of action being logged
 * @param options - Optional fields (resourceType, resourceId, resourceName, field, oldValue, newValue, metadata, contentEditId)
 */
export async function logActivity(
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
  } = {}
): Promise<QueryResult<ActivityLog>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    // Build log entry, filtering out undefined values for Firestore
    const logEntry: Omit<ActivityLog, 'id' | 'timestamp'> & { timestamp: any } = {
      userId,
      userEmail,
      userName,
      action,
      timestamp: serverTimestamp(),
      undoable: options.undoable ?? false,
      undone: false,
    };
    
    // Only add optional fields if they are defined
    if (options.resourceType !== undefined) logEntry.resourceType = options.resourceType;
    if (options.resourceId !== undefined) logEntry.resourceId = options.resourceId;
    if (options.resourceName !== undefined) logEntry.resourceName = options.resourceName;
    if (options.field !== undefined) logEntry.field = options.field;
    if (options.oldValue !== undefined) logEntry.oldValue = options.oldValue;
    if (options.newValue !== undefined) logEntry.newValue = options.newValue;
    if (options.metadata !== undefined) logEntry.metadata = options.metadata;
    if (options.contentEditId !== undefined) logEntry.contentEditId = options.contentEditId;

    const docRef = await addDoc(collection(firestore, 'activityLogs'), logEntry);

    return {
      success: true,
      data: {
        ...logEntry,
        id: docRef.id,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('Error logging activity:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log activity',
    };
  }
}

/**
 * Get recent activity logs
 */
export async function getRecentActivities(
  limitCount: number = 50
): Promise<QueryResult<ActivityLog[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const logsRef = collection(firestore, 'activityLogs');
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(limitCount));

    const querySnapshot = await getDocs(q);
    const logs: ActivityLog[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      logs.push({
        ...data,
        id: doc.id,
        timestamp:
          data.timestamp instanceof Timestamp
            ? data.timestamp.toDate().toISOString()
            : data.timestamp,
      } as ActivityLog);
    });

    return { success: true, data: logs };
  } catch (error) {
    console.error('Error fetching activities:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch activities',
    };
  }
}

/**
 * Get activity logs for a specific user
 */
export async function getUserActivities(
  userId: string,
  limitCount: number = 50
): Promise<QueryResult<ActivityLog[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const logsRef = collection(firestore, 'activityLogs');
    const q = query(
      logsRef,
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    const logs: ActivityLog[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      logs.push({
        ...data,
        id: doc.id,
        timestamp:
          data.timestamp instanceof Timestamp
            ? data.timestamp.toDate().toISOString()
            : data.timestamp,
      } as ActivityLog);
    });

    return { success: true, data: logs };
  } catch (error) {
    console.error('Error fetching user activities:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch user activities',
    };
  }
}

/**
 * Get activity logs for a specific resource
 */
export async function getResourceActivities(
  resourceId: number,
  limitCount: number = 20
): Promise<QueryResult<ActivityLog[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const logsRef = collection(firestore, 'activityLogs');
    const q = query(
      logsRef,
      where('resourceId', '==', resourceId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    const logs: ActivityLog[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      logs.push({
        ...data,
        id: doc.id,
        timestamp:
          data.timestamp instanceof Timestamp
            ? data.timestamp.toDate().toISOString()
            : data.timestamp,
      } as ActivityLog);
    });

    return { success: true, data: logs };
  } catch (error) {
    console.error('Error fetching resource activities:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch resource activities',
    };
  }
}

/**
 * Activity log export format
 */
export interface ActivityLogExport {
  exportedAt: string;
  version: string;
  activityCount: number;
  activities: ActivityLog[];
}

/**
 * Export all activity logs to JSON format
 */
export async function exportActivityLogs(): Promise<QueryResult<ActivityLogExport>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const logsRef = collection(firestore, 'activityLogs');
    const q = query(logsRef, orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);

    const activities: ActivityLog[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      activities.push({
        ...data,
        id: doc.id,
        timestamp:
          data.timestamp instanceof Timestamp
            ? data.timestamp.toDate().toISOString()
            : data.timestamp,
      } as ActivityLog);
    });

    const exportData: ActivityLogExport = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      activityCount: activities.length,
      activities,
    };

    return { success: true, data: exportData };
  } catch (error) {
    console.error('Error exporting activity logs:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export activity logs',
    };
  }
}

/**
 * Import activity logs from JSON format
 * @param exportData - The exported activity log data
 * @param overwrite - If true, clears existing logs before import
 */
export async function importActivityLogs(
  exportData: ActivityLogExport,
  overwrite: boolean = false
): Promise<QueryResult<{ imported: number; skipped: number }>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    // Validate export format
    if (!exportData.activities || !Array.isArray(exportData.activities)) {
      return { success: false, error: 'Invalid export format: missing activities array' };
    }

    let imported = 0;
    let skipped = 0;

    // Optional: Clear existing logs if overwrite is true
    if (overwrite) {
      const logsRef = collection(firestore, 'activityLogs');
      const snapshot = await getDocs(logsRef);
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
    }

    // Import each activity log
    for (const activity of exportData.activities) {
      try {
        // Skip if ID already exists (unless overwrite mode)
        if (!overwrite && activity.id) {
          const logsRef = collection(firestore, 'activityLogs');
          const existingDoc = await getDocs(
            query(logsRef, where('__name__', '==', activity.id))
          );
          if (!existingDoc.empty) {
            skipped++;
            continue;
          }
        }

        // Convert timestamp string back to Timestamp for Firestore
        const logData = {
          ...activity,
          timestamp: activity.timestamp
            ? (typeof activity.timestamp === 'string' ? Timestamp.fromDate(new Date(activity.timestamp)) : activity.timestamp)
            : serverTimestamp(),
        };

        // Remove id from the data (Firestore will generate or use the specified one)
        const { id, ...dataWithoutId } = logData;

        if (id) {
          // Use the original ID if available
          await setDoc(doc(firestore, 'activityLogs', id), dataWithoutId);
        } else {
          // Let Firestore generate a new ID
          await addDoc(collection(firestore, 'activityLogs'), dataWithoutId);
        }

        imported++;
      } catch (error) {
        console.error('Error importing activity:', error);
        skipped++;
      }
    }

    return {
      success: true,
      data: { imported, skipped },
    };
  } catch (error) {
    console.error('Error importing activity logs:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import activity logs',
    };
  }
}

/**
 * Download activity logs as JSON file
 */
export function downloadActivityLogsAsJSON(exportData: ActivityLogExport, filename?: string) {
  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `activity-logs-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
