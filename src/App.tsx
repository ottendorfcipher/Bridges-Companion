import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { firestore } from '@config/firebase';
import { useDatabase } from '@hooks/useDatabase';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { getEffectiveCategoriesForRender, type EffectiveCategory } from '@utils/contentCatalog';
import { initializeTheme } from '@utils/theme';
import { warmAppCheckToken } from '@utils/appCheck';
import { migrateBookmarks } from '@utils/migrateBookmarks';
import { trackNavigation, trackAuth, flushTracking } from '@utils/userActionTracker';
import { AuthProvider } from '@contexts/AuthContext';
import { EditModeProvider } from '@contexts/EditModeContext';
import { LoginScreen } from '@components/Auth/LoginScreen';
import { Sidebar } from '@components/Sidebar/Sidebar';
import { MobileHeader } from './components/MobileHeader/MobileHeader';
import { HamburgerMenu } from './components/HamburgerMenu/HamburgerMenu';
import { CategoryView } from './components/CategoryView/CategoryView';
import { CategoryListView } from './components/CategoryListView/CategoryListView';
import { Home } from './components/Home/Home';
import { BookmarksView } from './components/Bookmarks/BookmarksView';
import { ReferencesView } from './components/References/ReferencesView';
import { AdminLayout } from '@components/Admin/AdminLayout';
import { UserList } from '@components/Admin/UserManagement/UserList';
import { ActivityLogs } from '@components/Admin/ActivityLogs/ActivityLogs';
import { VersionManifest } from '@components/Admin/VersionManifest/VersionManifest';
import { AssignmentsView } from '@components/Admin/Assignments/AssignmentsView';
import { ContentManager } from '@components/Admin/ContentManager/ContentManager';
import './styles/global.css';

/**
 * AppContent - Main app content after authentication
 * Separated to allow useAuth hook (which requires AuthProvider)
 */
function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const permissions = usePermissions();
  const canIncludeDraft = permissions.canEditContent();
  const { isLoading: dbLoading, isReady, error } = useDatabase();
  const [activeTab, setActiveTab] = useState<string | null>(null); // null = home screen
  const [activeModule, setActiveModule] = useState<string | null>(null); // null = category list
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null); // section to auto-expand
  const [categories, setCategories] = useState<EffectiveCategory[]>([]);
  const [editedModules, setEditedModules] = useState<string[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminView, setAdminView] = useState<'users' | 'logs' | 'versions' | 'assignments' | 'content'>('users');

  // Initialize theme on mount
  useEffect(() => {
    initializeTheme();

    // App Check (reCAPTCHA v3) — prefetch token during splash/loading.
    // We do not block rendering; this reduces perceived latency and avoids extra user steps.
    void warmAppCheckToken({ timeoutMs: 2000 });
  }, []);

  useEffect(() => {
    if (isReady && user) {
      loadCategories();
      migrateBookmarks(); // Migrate old bookmarks with "Untitled" titles
      trackAuth(user, 'login'); // Track user login
    }

    // Track logout on unmount or user change
    return () => {
      if (user) {
        flushTracking(); // Flush any pending tracking events
      }
    };
  }, [isReady, user, canIncludeDraft]);

  // Re-evaluate categories when edit permissions change.
  useEffect(() => {
    if (!isReady || !user) return;
    loadCategories();
  }, [isReady, user, canIncludeDraft]);

  // Allow the CMS to notify the app that catalog overlays changed (so admins can preview without reload).
  useEffect(() => {
    if (!isReady || !user) return;

    const handler = () => {
      loadCategories();
    };

    window.addEventListener('bridge:content-catalog-changed', handler);
    return () => window.removeEventListener('bridge:content-catalog-changed', handler);
  }, [isReady, user, canIncludeDraft]);

  // Track navigation changes
  useEffect(() => {
    if (!user) return;
    
    if (showAdmin) {
      trackNavigation(user, 'admin');
    } else if (activeTab === null || activeTab === 'home') {
      trackNavigation(user, 'home');
    } else if (activeTab === 'bookmarks') {
      trackNavigation(user, 'bookmarks');
    } else if (activeModule) {
      const category = categories.find(c => c.slug === activeModule);
      trackNavigation(user, 'category', category?.name, activeModule);
    }
  }, [activeTab, activeModule, showAdmin, user, categories]);

  // Allow deep components (e.g. tag picker) to navigate to Admin → Assignments.
  useEffect(() => {
    const handler = () => {
      setShowAdmin(true);
      setAdminView('assignments');
    };

    window.addEventListener('bridge:open-admin-assignments', handler);
    return () => window.removeEventListener('bridge:open-admin-assignments', handler);
  }, []);
  
  // Set up real-time listener for edited modules and category titles
  useEffect(() => {
    if (!isReady || !user || !firestore) return;

    const editsRef = collection(firestore, 'contentEdits');
    const q = query(editsRef, where('status', 'in', ['active', 'published']));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const moduleSlugs = new Set<string>();

        snapshot.forEach((doc) => {
          const data = doc.data();
          moduleSlugs.add(data.moduleSlug);
        });

        setEditedModules(Array.from(moduleSlugs));
      },
      (error) => {
        console.error('Error listening to edited modules:', error);
      }
    );

    return () => unsubscribe();
  }, [isReady, user]);

  const loadCategories = async () => {
    const includeDraft = canIncludeDraft;
    const result = await getEffectiveCategoriesForRender({ includeDraft });
    if (result.success && result.data) {
      setCategories(result.data);
    }
  };

  // Show loading screen while checking auth
  if (authLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div className="loading-skeleton" style={{ 
          width: '80px', 
          height: '80px', 
          borderRadius: '12px' 
        }} />
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Loading...
        </p>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!user) {
    return <LoginScreen />;
  }

  // Show loading screen while initializing database
  if (dbLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div className="loading-skeleton" style={{ 
          width: '80px', 
          height: '80px', 
          borderRadius: '12px' 
        }} />
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Loading...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '16px',
        padding: '20px'
      }}>
        <div style={{ 
          fontSize: '48px',
          color: 'var(--color-error)'
        }}>
          ⚠️
        </div>
        <h2>Unable to Load</h2>
        <p style={{ 
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          maxWidth: '500px'
        }}>
          {error}
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={async () => {
              const { signOut } = await import('@utils/auth');
              await signOut();
              window.location.reload();
            }}
            style={{
              padding: '12px 24px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-separator)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              fontSize: '17px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: 'var(--color-primary)',
              color: '#FFFFFF',
              fontSize: '17px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return null;
  }

  const tabs = categories.map((cat) => {
    return {
      id: cat.slug,
      label: cat.name,
      icon: cat.icon || 'link',
      iconType: cat.iconType,
      iconUrl: cat.iconUrl,
      slug: cat.slug,
      hasEdits: editedModules.includes(cat.slug),
    };
  });

  // Show admin panel if requested
  if (showAdmin && permissions.canAccessAdmin()) {
    return (
      <AdminLayout
        activeView={adminView}
        onNavigate={setAdminView}
        onBackToApp={() => setShowAdmin(false)}
      >
        {adminView === 'users' && <UserList />}
        {adminView === 'logs' && <ActivityLogs />}
        {adminView === 'versions' && <VersionManifest />}
        {adminView === 'assignments' && <AssignmentsView />}
        {adminView === 'content' && <ContentManager />}
      </AdminLayout>
    );
  }

  return (
    <div className="app">
      {/* Mobile Header - Hidden on Desktop */}
      <div className="hide-on-desktop">
        <MobileHeader onMenuClick={() => setIsMenuOpen(true)} />
      </div>

      {/* Mobile Hamburger Menu - Hidden on Desktop */}
      {tabs.length > 0 && (
        <div className="hide-on-desktop">
          <HamburgerMenu 
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(slug) => { setActiveTab(slug); setActiveModule(null); setActiveSectionId(null); }}
            isOpen={isMenuOpen}
            onClose={() => setIsMenuOpen(false)}
            onAdminClick={permissions.canAccessAdmin() ? () => setShowAdmin(true) : undefined}
          />
        </div>
      )}

      {/* Desktop Sidebar - Hidden on Mobile/Tablet */}
      {tabs.length > 0 && (
        <aside className="app-sidebar hide-on-mobile hide-on-tablet">
          <Sidebar 
            tabs={tabs} 
            activeTab={activeTab} 
            onTabChange={(slug) => { setActiveTab(slug); setActiveModule(null); setActiveSectionId(null); }}
            onAdminClick={permissions.canAccessAdmin() ? () => setShowAdmin(true) : undefined}
          />
        </aside>
      )}
      
      {/* Main Content Area */}
      <main className="app-main">
        {activeTab === null || activeTab === 'home' ? (
          <Home onNavigate={(slug) => { setActiveTab(slug); setActiveModule(null); }} />
        ) : activeTab === 'bookmarks' ? (
          <BookmarksView
            onNavigateHome={() => { setActiveTab(null); setActiveModule(null); setActiveSectionId(null); }}
          />
        ) : activeTab === 'reference' ? (
          <ReferencesView
            onNavigateHome={() => { setActiveTab(null); setActiveModule(null); setActiveSectionId(null); }}
          />
        ) : activeModule === null ? (
          <CategoryListView 
            slug={activeTab}
            onNavigateHome={() => { setActiveTab(null); setActiveModule(null); }}
            onNavigateToModule={(moduleSlug) => setActiveModule(moduleSlug)}
          />
        ) : (
          <CategoryView 
            slug={activeModule} 
            expandSectionId={activeSectionId}
            onNavigateHome={() => { setActiveTab(null); setActiveModule(null); setActiveSectionId(null); }}
            onNavigateToCategory={() => { setActiveModule(null); setActiveSectionId(null); }}
          />
        )}
      </main>
      
    </div>
  );
}

/**
 * App - Root component wrapped with AuthProvider and EditModeProvider
 */
function App() {
  return (
    <AuthProvider>
      <EditModeProvider>
        <AppContent />
      </EditModeProvider>
    </AuthProvider>
  );
}

export default App;
