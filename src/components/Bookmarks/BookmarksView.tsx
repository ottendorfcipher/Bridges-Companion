import { useState, useEffect, useMemo, useCallback } from 'react';
import { getBookmarks, removeBookmark } from '@utils/bookmarks';
import { getAssignedTagsForUser, getAssignedSectionsForTag } from '@utils/assignedTags';
import { useAuth } from '@hooks/useAuth';
import { Icon } from '../Icon/Icon';
import { SectionModal } from '../SectionModal/SectionModal';
import styles from './BookmarksView.module.css';

interface PersonalBookmark {
  sectionId: number;
  categorySlug: string;
  sectionTitle: string;
  timestamp: number;
}

interface AssignedBookmarkDisplayItem {
  sectionId: number;
  categorySlug: string;
  sectionTitle: string;
  latestAssignedAt: number;
  tags: Array<{ id: string; name: string; color: string }>;
}

interface BookmarksViewProps {
  onNavigateHome?: () => void;
}

/**
 * BookmarksView - Display all bookmarked pages for review
 * 
 * Following NN/g principles:
 * - Clear visual hierarchy
 * - Easy access to saved content
 * - Simple removal action
 * - Group by category for scannability
 */
export function BookmarksView({ onNavigateHome }: BookmarksViewProps) {
  const { user } = useAuth();

  const [mode, setMode] = useState<'personal' | 'assigned'>('personal');

  const [bookmarks, setBookmarks] = useState<PersonalBookmark[]>([]);
  const [assigned, setAssigned] = useState<AssignedBookmarkDisplayItem[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [assignedError, setAssignedError] = useState<string | null>(null);

  const [selectedSection, setSelectedSection] = useState<{ id: number; title: string } | null>(null);

  const loadBookmarks = useCallback(() => {
    const allBookmarks = getBookmarks();
    setBookmarks(allBookmarks);
  }, []);

  const loadAssigned = useCallback(async () => {
    if (!user) return;

    setAssignedLoading(true);
    setAssignedError(null);

    const tagsRes = await getAssignedTagsForUser(user.uid);
    if (!tagsRes.success || !tagsRes.data) {
      setAssigned([]);
      setAssignedError(tagsRes.error || 'Failed to load assigned tags');
      setAssignedLoading(false);
      return;
    }

    const tags = tagsRes.data;

    const sectionsByTag = await Promise.all(
      tags.map(async (t) => {
        const res = await getAssignedSectionsForTag(t.id);
        return { tag: t, sections: res.success && res.data ? res.data : [] };
      })
    );

    // Dedupe by sectionId, but preserve all tags as chips.
    const map = new Map<number, AssignedBookmarkDisplayItem>();

    for (const entry of sectionsByTag) {
      for (const s of entry.sections) {
        const existing = map.get(s.sectionId);
        const assignedAtMs = s.assignedAt ? new Date(s.assignedAt).getTime() : 0;

        const tagChip = { id: entry.tag.id, name: entry.tag.name, color: entry.tag.color };

        if (!existing) {
          map.set(s.sectionId, {
            sectionId: s.sectionId,
            sectionTitle: s.sectionTitle,
            categorySlug: s.categorySlug,
            latestAssignedAt: assignedAtMs,
            tags: [tagChip],
          });
        } else {
          const hasChip = existing.tags.some((t) => t.id === tagChip.id);
          if (!hasChip) {
            existing.tags.push(tagChip);
          }
          existing.latestAssignedAt = Math.max(existing.latestAssignedAt, assignedAtMs);
          if (!existing.sectionTitle && s.sectionTitle) {
            existing.sectionTitle = s.sectionTitle;
          }
          if (!existing.categorySlug && s.categorySlug) {
            existing.categorySlug = s.categorySlug;
          }
        }
      }
    }

    const list = Array.from(map.values()).sort((a, b) => b.latestAssignedAt - a.latestAssignedAt);
    setAssigned(list);

    setAssignedLoading(false);
  }, [user]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  useEffect(() => {
    if (mode !== 'assigned') return;
    loadAssigned();
  }, [mode, loadAssigned]);

  const handleRemove = (sectionId: number) => {
    removeBookmark(sectionId);
    loadBookmarks();
  };

  const visiblePersonal = useMemo(() => bookmarks, [bookmarks]);

  // Group personal bookmarks by category for display
  const groupedBookmarks = visiblePersonal.reduce((acc, bookmark) => {
    // Use category slug or 'Other' as fallback
    const categoryKey = bookmark.categorySlug || 'Other';
    if (!acc[categoryKey]) {
      acc[categoryKey] = [];
    }
    acc[categoryKey].push(bookmark);
    return acc;
  }, {} as Record<string, PersonalBookmark[]>);

  const personalCount = bookmarks.length;
  const assignedCount = assigned.length;

  return (
    <div className={styles.container}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <button 
          className={styles.breadcrumbItem}
          onClick={onNavigateHome}
          aria-label="Go to home"
        >
          Home
        </button>
        <span className={styles.breadcrumbSeparator}>/</span>
        <span className={styles.breadcrumbCurrent}>Saved for Review</span>
      </nav>

      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <Icon name="bookmark" size={24} />
            </div>
            <h1 className={styles.title}>Saved for Review</h1>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.segmentedControl} role="tablist" aria-label="Saved for Review tabs">
              <button
                className={`${styles.segmentButton} ${mode === 'personal' ? styles.segmentActive : ''}`}
                onClick={() => setMode('personal')}
                role="tab"
                aria-selected={mode === 'personal'}
              >
                Personal
              </button>
              <button
                className={`${styles.segmentButton} ${mode === 'assigned' ? styles.segmentActive : ''}`}
                onClick={() => setMode('assigned')}
                role="tab"
                aria-selected={mode === 'assigned'}
              >
                Assigned to Me
              </button>
            </div>
          </div>
        </div>

        <p className={styles.description}>
          {mode === 'personal'
            ? `${personalCount} ${personalCount === 1 ? 'page' : 'pages'} saved`
            : `${assignedCount} ${assignedCount === 1 ? 'page' : 'pages'} assigned`}
        </p>
      </div>

      {mode === 'personal' ? (
        <div className={styles.bookmarksList}>
          {personalCount === 0 ? (
            <div className={styles.emptyState}>
              <Icon name="bookmark" size={48} />
              <p className={styles.emptyTitle}>No personal bookmarks yet</p>
              <p className={styles.emptyDescription}>
                Use the bookmark button at the bottom of any page to save it for later review
              </p>
            </div>
          ) : (
            Object.entries(groupedBookmarks).map(([categorySlug, categoryBookmarks]) => (
              <div key={categorySlug} className={styles.categoryGroup}>
                <h2 className={styles.categoryTitle}>
                  {typeof categorySlug === 'string'
                    ? categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1)
                    : 'Bookmarked Pages'}
                </h2>
                <div className={styles.bookmarkItems}>
                  {categoryBookmarks.map((bookmark) => (
                    <div key={bookmark.sectionId} className={styles.bookmarkCard}>
                      <button
                        className={styles.bookmarkContent}
                        onClick={() => setSelectedSection({ id: bookmark.sectionId, title: bookmark.sectionTitle })}
                        aria-label={`Open ${bookmark.sectionTitle}`}
                      >
                        <div className={styles.bookmarkInfo}>
                          <h3 className={styles.bookmarkTitle}>{bookmark.sectionTitle}</h3>
                          <p className={styles.bookmarkMeta}>
                            Saved {new Date(bookmark.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        <Icon name="chevron-right" size={20} />
                      </button>
                      <button
                        className={styles.removeButton}
                        onClick={() => handleRemove(bookmark.sectionId)}
                        aria-label={`Remove ${bookmark.sectionTitle} from bookmarks`}
                        title="Remove bookmark"
                      >
                        <Icon name="x" size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className={styles.bookmarksList}>
          {assignedLoading ? (
            <div className={styles.emptyState}>
              <Icon name="loader" size={48} />
              <p className={styles.emptyTitle}>Loading assigned bookmarks…</p>
            </div>
          ) : assignedError ? (
            <div className={styles.emptyState}>
              <Icon name="alert-circle" size={48} />
              <p className={styles.emptyTitle}>Couldn’t load assigned bookmarks</p>
              <p className={styles.emptyDescription}>{assignedError}</p>
            </div>
          ) : assigned.length === 0 ? (
            <div className={styles.emptyState}>
              <Icon name="tag" size={48} />
              <p className={styles.emptyTitle}>No assigned bookmarks</p>
              <p className={styles.emptyDescription}>
                Assigned bookmarks from admins will appear here.
              </p>
            </div>
          ) : (
            <div className={styles.bookmarkItems}>
              {assigned.map((item) => (
                <div key={item.sectionId} className={styles.bookmarkCard}>
                  <button
                    className={styles.bookmarkContent}
                    onClick={() => setSelectedSection({ id: item.sectionId, title: item.sectionTitle })}
                    aria-label={`Open ${item.sectionTitle}`}
                  >
                    <div className={styles.bookmarkInfo}>
                      <h3 className={styles.bookmarkTitle}>{item.sectionTitle}</h3>
                      <div className={styles.tagChips}>
                        {item.tags.map((t) => (
                          <span key={t.id} className={styles.tagChip}>
                            <span className={styles.tagDot} style={{ background: t.color }} />
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Icon name="chevron-right" size={20} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {selectedSection && (
        <SectionModal
          sectionId={selectedSection.id}
          sectionTitle={selectedSection.title}
          onClose={() => setSelectedSection(null)}
        />
      )}
    </div>
  );
}
