import { useEffect, useState, useMemo, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { firestore } from '@config/firebase';
import { useAuth } from '@hooks/useAuth';
import { 
  type ActivityLog,
  type ActivityLogExport,
  exportActivityLogs,
  importActivityLogs,
  downloadActivityLogsAsJSON,
} from '@utils/activityLog';
import { getAllUsers } from '@utils/userProfile';
import styles from './ActivityLogs.module.css';

export function ActivityLogs() {
  const { user: _user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<{ imported: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);

  const loadUsers = async () => {
    const result = await getAllUsers();
    if (result.success && result.data) {
      const users = result.data.map((u: any) => ({
        id: u.uid,
        name: u.displayName || u.email || 'Unknown User',
        email: u.email || '',
      }));
      setAvailableUsers(users);
    }
  };

  useEffect(() => {
    loadUsers();
    
    // Set up real-time listener for activity logs
    if (!firestore) {
      setError('Firestore is not initialized');
      setLoading(false);
      return;
    }
    
    const logsRef = collection(firestore, 'activityLogs');
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(500));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logsData: ActivityLog[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          logsData.push({
            ...data,
            id: doc.id,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp,
          } as ActivityLog);
        });
        setLogs(logsData);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to activity logs:', error);
        setError(error.message || 'Failed to listen to activity logs');
        setLoading(false);
      }
    );
    
    return () => unsubscribe();
  }, []);

  // Filter logs based on search and filters
  // Exclude content edit actions (they're now in Version Manifest)
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Filter out content edit actions - these are handled in Version Manifest
      if (log.action === 'edit_title' || log.action === 'edit_content' || log.action === 'edit_purpose') {
        return false;
      }
      
      // Search query filter (search in resource name, user name, action)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          (log.resourceName?.toLowerCase() || '').includes(query) ||
          log.userName.toLowerCase().includes(query) ||
          log.userEmail.toLowerCase().includes(query) ||
          getActionLabel(log.action).toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // User filter
      if (selectedUser !== 'all' && log.userId !== selectedUser) {
        return false;
      }
      
      // Action filter
      if (selectedAction !== 'all' && log.action !== selectedAction) {
        return false;
      }
      
      // Date range filter
      if (dateRange.start || dateRange.end) {
        const logDate = new Date(log.timestamp as string);
        if (dateRange.start) {
          const startDate = new Date(dateRange.start);
          if (logDate < startDate) return false;
        }
        if (dateRange.end) {
          const endDate = new Date(dateRange.end);
          endDate.setHours(23, 59, 59, 999); // Include the entire end date
          if (logDate > endDate) return false;
        }
      }
      
      return true;
    });
  }, [logs, searchQuery, selectedUser, selectedAction, dateRange]);
  
  const handleExportJSON = async () => {
    setExporting(true);
    setError(null);

    const result = await exportActivityLogs();
    if (result.success && result.data) {
      downloadActivityLogsAsJSON(result.data);
    } else {
      setError(result.error || 'Failed to export activity logs');
    }

    setExporting(false);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setImportSuccess(null);

    try {
      const fileContent = await file.text();
      const importData: ActivityLogExport = JSON.parse(fileContent);

      // Validate the import data structure
      if (!importData.activities || !Array.isArray(importData.activities)) {
        setError('Invalid file format: missing activities array');
        setImporting(false);
        return;
      }

      const overwrite = confirm(
        `Import ${importData.activityCount} activity log(s)?\n\n` +
        `Choose:\n` +
        `OK = Merge with existing logs (skip duplicates)\n` +
        `Cancel = Abort import`
      );

      if (!overwrite && overwrite !== false) {
        setImporting(false);
        return;
      }

      const result = await importActivityLogs(importData, false);
      if (result.success && result.data) {
        setImportSuccess(result.data);
      } else {
        setError(result.error || 'Failed to import activity logs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse JSON file');
    }

    setImporting(false);
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedUser('all');
    setSelectedAction('all');
    setDateRange({ start: '', end: '' });
  };
  

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };


  const getActionIcon = (action: ActivityLog['action']): string => {
    switch (action) {
      // Content editing
      case 'edit_title':
      case 'edit_content':
      case 'edit_purpose':
        return '✏️';
      // Navigation
      case 'navigate_home': return '🏠';
      case 'navigate_category': return '📚';
      case 'navigate_section': return '📄';
      case 'navigate_bookmarks': return '🔖';
      case 'navigate_admin': return '⚙️';
      // Authentication
      case 'user_login': return '🔑';
      case 'user_logout': return '🚪';
      // Bookmarks
      case 'bookmark_add': return '➕';
      case 'bookmark_remove': return '➖';
      // Search
      case 'search_performed': return '🔍';
      // UI interactions
      case 'accordion_expand': return '▼';
      case 'accordion_collapse': return '▶';
      case 'theme_toggle': return '🌓';
      // Admin actions
      case 'user_role_change': return '👤';
      case 'user_status_change': return '🔄';
      case 'admin_panel_access': return '🔐';
      case 'security_lockdown_toggle': return '🔒';
      case 'security_allowlist_update': return '🧾';
      case 'assignments_tag_saved': return '🏷️';

      // CMS structure
      case 'catalog_category_create': return '➕';
      case 'catalog_category_update': return '✏️';
      case 'catalog_category_hide': return '🙈';
      case 'catalog_category_unhide': return '👁️';
      case 'catalog_category_delete': return '🗑️';
      case 'catalog_category_restore': return '♻️';
      case 'catalog_module_create': return '➕';
      case 'catalog_module_update': return '✏️';
      case 'catalog_module_hide': return '🙈';
      case 'catalog_module_unhide': return '👁️';
      case 'catalog_module_delete': return '🗑️';
      case 'catalog_module_restore': return '♻️';
      case 'catalog_page_create': return '➕';
      case 'catalog_page_update': return '✏️';
      case 'catalog_page_hide': return '🙈';
      case 'catalog_page_unhide': return '👁️';
      case 'catalog_page_delete': return '🗑️';
      case 'catalog_page_restore': return '♻️';

      // Versioning
      case 'version_published': return '🚀';
      case 'version_set_live': return '⏪';
      case 'version_removed': return '🗑️';
      case 'version_reset_base': return '🧱';
      default: return '•';
    }
  };

  const getActionLabel = (action: ActivityLog['action']): string => {
    switch (action) {
      // Content editing
      case 'edit_title': return 'Edited Title';
      case 'edit_content': return 'Edited Content';
      case 'edit_purpose': return 'Edited Purpose';
      // Navigation
      case 'navigate_home': return 'Viewed Home';
      case 'navigate_category': return 'Viewed Category';
      case 'navigate_section': return 'Viewed Section';
      case 'navigate_bookmarks': return 'Viewed Bookmarks';
      case 'navigate_admin': return 'Accessed Admin';
      // Authentication
      case 'user_login': return 'Logged In';
      case 'user_logout': return 'Logged Out';
      // Bookmarks
      case 'bookmark_add': return 'Added Bookmark';
      case 'bookmark_remove': return 'Removed Bookmark';
      // Search
      case 'search_performed': return 'Searched';
      // UI interactions
      case 'accordion_expand': return 'Expanded Section';
      case 'accordion_collapse': return 'Collapsed Section';
      case 'theme_toggle': return 'Toggled Theme';
      // Admin actions
      case 'user_role_change': return 'Changed User Role';
      case 'user_status_change': return 'Changed User Status';
      case 'admin_panel_access': return 'Accessed Admin Panel';
      case 'security_lockdown_toggle': return 'Toggled Lockdown Mode';
      case 'security_allowlist_update': return 'Updated Sign-in Whitelist';
      case 'assignments_tag_saved': return 'Saved Assignment Tag';

      // CMS structure
      case 'catalog_category_create': return 'Created Category';
      case 'catalog_category_update': return 'Updated Category';
      case 'catalog_category_hide': return 'Hid Category';
      case 'catalog_category_unhide': return 'Unhid Category';
      case 'catalog_category_delete': return 'Deleted Category';
      case 'catalog_category_restore': return 'Restored Category';
      case 'catalog_module_create': return 'Created Module';
      case 'catalog_module_update': return 'Updated Module';
      case 'catalog_module_hide': return 'Hid Module';
      case 'catalog_module_unhide': return 'Unhid Module';
      case 'catalog_module_delete': return 'Deleted Module';
      case 'catalog_module_restore': return 'Restored Module';
      case 'catalog_page_create': return 'Created Page';
      case 'catalog_page_update': return 'Updated Page';
      case 'catalog_page_hide': return 'Hid Page';
      case 'catalog_page_unhide': return 'Unhid Page';
      case 'catalog_page_delete': return 'Deleted Page';
      case 'catalog_page_restore': return 'Restored Page';

      // Versioning
      case 'version_published': return 'Published Version';
      case 'version_set_live': return 'Set Live Version';
      case 'version_removed': return 'Removed Version';
      case 'version_reset_base': return 'Reset Versioning to Base';
      default: return 'Unknown Action';
    }
  };

  const getActionCategory = (action: ActivityLog['action']): string => {
    if (['edit_title', 'edit_content', 'edit_purpose'].includes(action)) return 'content';
    if (['navigate_home', 'navigate_category', 'navigate_section', 'navigate_bookmarks', 'navigate_admin'].includes(action)) return 'navigation';
    if (['user_login', 'user_logout'].includes(action)) return 'auth';
    if (['bookmark_add', 'bookmark_remove'].includes(action)) return 'bookmark';
    if (action === 'search_performed') return 'search';
    if (['accordion_expand', 'accordion_collapse', 'theme_toggle'].includes(action)) return 'ui';
    if (
      [
        'user_role_change',
        'user_status_change',
        'admin_panel_access',
        'security_lockdown_toggle',
        'security_allowlist_update',
        'assignments_tag_saved',
        'catalog_category_create',
        'catalog_category_update',
        'catalog_category_hide',
        'catalog_category_unhide',
        'catalog_category_delete',
        'catalog_category_restore',
        'catalog_module_create',
        'catalog_module_update',
        'catalog_module_hide',
        'catalog_module_unhide',
        'catalog_module_delete',
        'catalog_module_restore',
        'catalog_page_create',
        'catalog_page_update',
        'catalog_page_hide',
        'catalog_page_unhide',
        'catalog_page_delete',
        'catalog_page_restore',
        'version_published',
        'version_set_live',
        'version_removed',
        'version_reset_base',
      ].includes(action)
    )
      return 'admin';
    return 'other';
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Activity Logs</h1>
        <div className={styles.loading}>Loading activity logs...</div>
      </div>
    );
  }

  const hasActiveFilters = searchQuery || selectedUser !== 'all' || selectedAction !== 'all' || dateRange.start || dateRange.end;
  
  // Calculate quick stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const stats = {
    todayLogins: logs.filter(l => l.action === 'user_login' && new Date(l.timestamp as string) >= today).length,
    activeUsers: new Set(logs.filter(l => new Date(l.timestamp as string) >= today).map(l => l.userId)).size,
    totalActions: filteredLogs.length,
    topAction: filteredLogs.length > 0 ? getActionLabel(
      filteredLogs.reduce((acc, log) => {
        const count = filteredLogs.filter(l => l.action === log.action).length;
        if (!acc.count || count > acc.count) {
          return { action: log.action, count };
        }
        return acc;
      }, { action: filteredLogs[0].action, count: 0 } as { action: ActivityLog['action'], count: number }).action
    ) : 'None',
  };
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Activity Logs</h1>
        <div className={styles.headerActions}>
          <button 
            onClick={handleImportClick} 
            className={styles.importButton}
            disabled={importing}
          >
            📤 {importing ? 'Importing...' : 'Import JSON'}
          </button>
          <button 
            onClick={handleExportJSON} 
            className={styles.exportButton} 
            disabled={logs.length === 0 || exporting}
          >
            📥 {exporting ? 'Exporting...' : 'Export JSON'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      </div>
      
      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>⚠️</span>
          <span>{error}</span>
        </div>
      )}
      
      {importSuccess && (
        <div className={styles.successBanner}>
          <span className={styles.successIcon}>✓</span>
          <span>
            Successfully imported {importSuccess.imported} log(s)
            {importSuccess.skipped > 0 && ` (${importSuccess.skipped} skipped)`}
          </span>
          <button 
            onClick={() => setImportSuccess(null)}
            className={styles.closeBannerButton}
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Quick Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.todayLogins}</div>
          <div className={styles.statLabel}>Logins Today</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.activeUsers}</div>
          <div className={styles.statLabel}>Active Users Today</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.totalActions}</div>
          <div className={styles.statLabel}>Total Actions</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ fontSize: '14px' }}>{stats.topAction}</div>
          <div className={styles.statLabel}>Most Common</div>
        </div>
      </div>
      
      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterRow}>
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
          
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Users</option>
            {availableUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Actions</option>
            <optgroup label="Navigation">
              <option value="navigate_home">Viewed Home</option>
              <option value="navigate_category">Viewed Category</option>
              <option value="navigate_section">Viewed Section</option>
              <option value="navigate_bookmarks">Viewed Bookmarks</option>
              <option value="navigate_admin">Accessed Admin</option>
            </optgroup>
            <optgroup label="Authentication">
              <option value="user_login">Logged In</option>
              <option value="user_logout">Logged Out</option>
            </optgroup>
            <optgroup label="Bookmarks">
              <option value="bookmark_add">Added Bookmark</option>
              <option value="bookmark_remove">Removed Bookmark</option>
            </optgroup>
            <optgroup label="UI Interactions">
              <option value="accordion_expand">Expanded Section</option>
              <option value="accordion_collapse">Collapsed Section</option>
              <option value="theme_toggle">Toggled Theme</option>
            </optgroup>
            <optgroup label="CMS Structure">
              <option value="catalog_category_create">Created Category</option>
              <option value="catalog_category_update">Updated Category</option>
              <option value="catalog_category_hide">Hid Category</option>
              <option value="catalog_category_unhide">Unhid Category</option>
              <option value="catalog_category_delete">Deleted Category</option>
              <option value="catalog_category_restore">Restored Category</option>
              <option value="catalog_module_create">Created Module</option>
              <option value="catalog_module_update">Updated Module</option>
              <option value="catalog_module_hide">Hid Module</option>
              <option value="catalog_module_unhide">Unhid Module</option>
              <option value="catalog_module_delete">Deleted Module</option>
              <option value="catalog_module_restore">Restored Module</option>
              <option value="catalog_page_create">Created Page</option>
              <option value="catalog_page_update">Updated Page</option>
              <option value="catalog_page_hide">Hid Page</option>
              <option value="catalog_page_unhide">Unhid Page</option>
              <option value="catalog_page_delete">Deleted Page</option>
              <option value="catalog_page_restore">Restored Page</option>
            </optgroup>
            <optgroup label="Admin Actions">
              <option value="user_role_change">Changed User Role</option>
              <option value="user_status_change">Changed User Status</option>
              <option value="security_lockdown_toggle">Toggled Lockdown Mode</option>
              <option value="security_allowlist_update">Updated Sign-in Whitelist</option>
              <option value="assignments_tag_saved">Saved Assignment Tag</option>
              <option value="version_published">Published Version</option>
              <option value="version_set_live">Set Live Version</option>
              <option value="version_removed">Removed Version</option>
              <option value="version_reset_base">Reset Versioning to Base</option>
            </optgroup>
          </select>
        </div>
        
        <div className={styles.filterRow}>
          <label className={styles.dateLabel}>
            From:
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className={styles.dateInput}
            />
          </label>
          
          <label className={styles.dateLabel}>
            To:
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className={styles.dateInput}
            />
          </label>
          
          {hasActiveFilters && (
            <button onClick={clearFilters} className={styles.clearButton}>
              ✕ Clear Filters
            </button>
          )}
          
          <div className={styles.resultCount}>
            Showing {filteredLogs.length} of {logs.length} logs
          </div>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {filteredLogs.length === 0 ? (
        <div className={styles.emptyState}>
          {logs.length === 0 ? (
            <>
              <p>No activity logs yet.</p>
              <p className={styles.emptyStateSubtext}>
                User actions (navigation, logins, etc.) will appear here.
              </p>
            </>
          ) : (
            <>
              <p>No logs match your filters.</p>
              <p className={styles.emptyStateSubtext}>
                Try adjusting your search criteria.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className={styles.logsList}>
          {filteredLogs.map((log) => (
            <div key={log.id} className={styles.logRow} data-category={getActionCategory(log.action)}>
              <span className={styles.logTime}>{formatTimestamp(log.timestamp as string)}</span>
              <span className={styles.logAction}>
                <span className={styles.logIcon}>{getActionIcon(log.action)}</span>
                {getActionLabel(log.action)}
              </span>
              <span className={styles.logResource}>
                {log.resourceName || log.metadata?.destination || '-'}
              </span>
              <span className={styles.logUser}>{log.userName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
