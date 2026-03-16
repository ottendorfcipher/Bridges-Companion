import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { firestore } from '@config/firebase';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import {
  getCurrentVersion,
  getCurrentVersionKey,
  getDraftVersion,
  getDraftVersionKey,
  getCurrentEpochId,
  publishVersion,
  incrementVersion,
  updateDraftVersionType,
  getAllVersions,
  getVersionChangelog,
  updateVersionDescription,
  setCurrentVersion as setCurrentVersionConfig,
  archiveVersion,
  resetVersioningToBase,
  parseSemanticVersion,
} from '@utils/versionManagement';
import { logActivity } from '@utils/activityLog';
import type { Version, VersionWithChangelog } from '@utils/versionManagement';
import type { ContentEdit } from '@utils/contentManagement';
import styles from './VersionManifest.module.css';

export function VersionManifest() {
  const { user } = useAuth();
  const permissions = usePermissions();
  const canEditVersionNotes = permissions.hasPermission('admin.full_access');
  const [draftChanges, setDraftChanges] = useState<ContentEdit[]>([]);
  const [draftCatalogCounts, setDraftCatalogCounts] = useState<{ categories: number; modules: number; pages: number }>({
    categories: 0,
    modules: 0,
    pages: 0,
  });
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [currentVersionKey, setCurrentVersionKey] = useState<string>('');
  const [draftVersion, setDraftVersion] = useState<string>('');
  const [draftVersionKey, setDraftVersionKey] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [versionType, setVersionType] = useState<'major' | 'minor' | 'patch'>('patch');
  const [updatingVersion, setUpdatingVersion] = useState(false);
  const [versionHistory, setVersionHistory] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionWithChangelog | null>(null);
  const [loadingChangelog, setLoadingChangelog] = useState(false);
  const [editingVersionNotes, setEditingVersionNotes] = useState(false);
  const [versionNotesDraft, setVersionNotesDraft] = useState('');
  const [savingVersionNotes, setSavingVersionNotes] = useState(false);
  const [settingLiveVersionKey, setSettingLiveVersionKey] = useState<string | null>(null);
  const [removingVersionKey, setRemovingVersionKey] = useState<string | null>(null);
  const [resettingToBase, setResettingToBase] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Real-time listener for draft content edits
  useEffect(() => {
    if (!firestore || !draftVersionKey) return;

    const editsRef = collection(firestore, 'contentEdits');
    const versionField = parseSemanticVersion(draftVersionKey) ? 'versionId' : 'versionKey';
    const q = query(editsRef, where(versionField, '==', draftVersionKey), where('status', '==', 'active'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const changes: ContentEdit[] = [];
        snapshot.forEach((doc) => {
          changes.push(doc.data() as ContentEdit);
        });
        // Sort by most recent first
        changes.sort((a, b) => {
          const timeA = typeof a.editedAt === 'string' ? new Date(a.editedAt).getTime() : 0;
          const timeB = typeof b.editedAt === 'string' ? new Date(b.editedAt).getTime() : 0;
          return timeB - timeA;
        });
        setDraftChanges(changes);
      },
      (error) => {
        console.error('Error listening to draft changes:', error);
      }
    );

    return () => unsubscribe();
  }, [draftVersionKey]);

  // Real-time listener for draft catalog overlays (category/module cards)
  useEffect(() => {
    if (!firestore || !draftVersionKey) return;

    const catsRef = collection(firestore, 'contentCategories');
    const modsRef = collection(firestore, 'contentModules');
    const pagesRef = collection(firestore, 'contentPages');

    const versionField = parseSemanticVersion(draftVersionKey) ? 'versionId' : 'versionKey';
    const catsQ = query(catsRef, where(versionField, '==', draftVersionKey), where('status', '==', 'active'));
    const modsQ = query(modsRef, where(versionField, '==', draftVersionKey), where('status', '==', 'active'));
    const pagesQ = query(pagesRef, where(versionField, '==', draftVersionKey), where('status', '==', 'active'));

    const unsubCats = onSnapshot(
      catsQ,
      (snapshot) => {
        setDraftCatalogCounts((prev) => ({ ...prev, categories: snapshot.size }));
      },
      (error) => {
        console.error('Error listening to draft category overlays:', error);
      }
    );

    const unsubMods = onSnapshot(
      modsQ,
      (snapshot) => {
        setDraftCatalogCounts((prev) => ({ ...prev, modules: snapshot.size }));
      },
      (error) => {
        console.error('Error listening to draft module overlays:', error);
      }
    );

    const unsubPages = onSnapshot(
      pagesQ,
      (snapshot) => {
        setDraftCatalogCounts((prev) => ({ ...prev, pages: snapshot.size }));
      },
      (error) => {
        console.error('Error listening to draft page overlays:', error);
      }
    );

    return () => {
      unsubCats();
      unsubMods();
      unsubPages();
    };
  }, [draftVersionKey]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const [currentResult, currentKeyRes, draftResult, draftKeyRes, epochRes, versionsResult] = await Promise.all([
      getCurrentVersion(),
      getCurrentVersionKey(),
      getDraftVersion(),
      getDraftVersionKey(),
      getCurrentEpochId(),
      getAllVersions(),
    ]);

    if (currentResult.success && currentResult.data) {
      setCurrentVersion(currentResult.data);
    }
    if (currentKeyRes.success && currentKeyRes.data) {
      setCurrentVersionKey(currentKeyRes.data);
    }
    if (draftResult.success && draftResult.data) {
      setDraftVersion(draftResult.data);
    }
    if (draftKeyRes.success && draftKeyRes.data) {
      setDraftVersionKey(draftKeyRes.data);
    }
    if (versionsResult.success && versionsResult.data) {
      // Filter to only show published versions.
      // In keyed (epoch) mode, only show versions from the current epoch.
      const publishedVersions = versionsResult.data.filter((v) => v.status === 'published');

      const epochId = epochRes.success ? epochRes.data : null;
      const scoped = typeof epochId === 'string' && epochId.trim().length > 0
        ? publishedVersions.filter((v) => v.epochId === epochId)
        : publishedVersions;

      setVersionHistory(scoped);
    }

    setLoading(false);
  };

  const handleViewChangelog = async (version: Version) => {
    setLoadingChangelog(true);
    setError(null);

    const versionKey = version.versionKey || version.versionId;
    const result = await getVersionChangelog(versionKey);
    if (result.success && result.data) {
      setSelectedVersion(result.data);
      setEditingVersionNotes(false);
      setVersionNotesDraft(result.data.description || '');
    } else {
      setError(result.error || 'Failed to load changelog');
    }

    setLoadingChangelog(false);
  };

  const closeChangelog = () => {
    setSelectedVersion(null);
    setEditingVersionNotes(false);
    setVersionNotesDraft('');
  };

  const handleSetLiveVersion = async (version: Version) => {
    if (!user) return;

    const versionKey = version.versionKey || version.versionId;
    if (!versionKey) return;

    if (versionKey === currentVersionKey) return;

    const confirmed = confirm(
      `Set live content to version ${version.versionId}?\n\n` +
        `This only affects content (what users read), not app functionality.\n\n` +
        `Current live: ${currentVersion || '(unknown)'}\n` +
        `New live: ${version.versionId}`
    );
    if (!confirmed) return;

    setSettingLiveVersionKey(versionKey);
    setError(null);

    const result = await setCurrentVersionConfig(versionKey);
    if (result.success) {
      await logActivity(
        user.uid,
        user.email || 'unknown',
        user.displayName || user.email || 'Unknown User',
        'version_set_live',
        {
          resourceType: 'module',
          resourceId: versionKey,
          resourceName: `Set live content version to ${version.versionId}`,
          metadata: {
            from: currentVersion,
            fromKey: currentVersionKey,
            to: version.versionId,
            toKey: versionKey,
          },
        }
      );
      await loadData();
    } else {
      setError(result.error || 'Failed to set live version');
    }

    setSettingLiveVersionKey(null);
  };

  const handleRemoveVersion = async (version: Version) => {
    if (!user) return;

    const versionKey = version.versionKey || version.versionId;
    if (!versionKey) return;

    if (versionKey === currentVersionKey) {
      alert('You cannot remove the currently live version. Set a different version live first.');
      return;
    }

    const confirmed = confirm(
      `Remove version ${version.versionId} from the version history?\n\n` +
        `This will hide it from the published list (it is archived), but it does not delete data.`
    );
    if (!confirmed) return;

    setRemovingVersionKey(versionKey);
    setError(null);

    const result = await archiveVersion(versionKey);
    if (result.success) {
      await logActivity(
        user.uid,
        user.email || 'unknown',
        user.displayName || user.email || 'Unknown User',
        'version_removed',
        {
          resourceType: 'module',
          resourceId: versionKey,
          resourceName: `Removed version ${version.versionId}`,
        }
      );
      await loadData();
    } else {
      setError(result.error || 'Failed to remove version');
    }

    setRemovingVersionKey(null);
  };

  const handleResetToBase = async () => {
    if (!user) return;

    const base = '0.1.0';
    const draft = '0.1.1';

    const confirmed = confirm(
      `Reset versioning to base?\n\n` +
        `This will set:\n` +
        `- Live version: ${base}\n` +
        `- Draft version: ${draft}\n\n` +
        `This only affects content (what users read), not app functionality.`
    );
    if (!confirmed) return;

    setResettingToBase(true);
    setError(null);

    const result = await resetVersioningToBase(
      base,
      draft,
      user.uid,
      user.displayName || user.email || 'Unknown User'
    );

    if (result.success) {
      await logActivity(
        user.uid,
        user.email || 'unknown',
        user.displayName || user.email || 'Unknown User',
        'version_reset_base',
        {
          resourceType: 'module',
          resourceId: base,
          resourceName: `Reset versioning to base ${base}`,
          metadata: { base, draft },
        }
      );
      await loadData();
    } else {
      setError(result.error || 'Failed to reset versioning');
    }

    setResettingToBase(false);
  };

  const handleVersionTypeChange = async (newType: 'major' | 'minor' | 'patch') => {
    setUpdatingVersion(true);
    setError(null);

    const result = await updateDraftVersionType(newType);

    if (result.success && result.data) {
      setVersionType(newType);
      setDraftVersion(result.data);
    } else {
      setError(result.error || 'Failed to update version type');
    }

    setUpdatingVersion(false);
  };

  const handlePublish = async () => {
    if (!user || !draftVersion) return;

    const catalogCount = draftCatalogCounts.categories + draftCatalogCounts.modules + draftCatalogCounts.pages;
    const totalChangeCount = draftChanges.length + catalogCount;

    if (totalChangeCount === 0) {
      alert('No changes to publish');
      return;
    }

    const message =
      `Publish ${totalChangeCount} change${totalChangeCount !== 1 ? 's' : ''} from draft version ${draftVersion}?\n\n` +
      `• Content edits: ${draftChanges.length}\n` +
      `• Catalog overlays: ${catalogCount} (categories: ${draftCatalogCounts.categories}, modules: ${draftCatalogCounts.modules}, pages: ${draftCatalogCounts.pages})\n\n` +
      `This will make them live for all users.`;

    if (!confirm(message)) {
      return;
    }

    setPublishing(true);
    setError(null);

    // Calculate next draft version (default to patch after publishing)
    const nextDraft = incrementVersion(draftVersion, 'patch');

    const result = await publishVersion(
      draftVersion,
      user.uid,
      user.displayName || user.email || 'Unknown User',
      nextDraft
    );

    if (result.success) {
      await logActivity(
        user.uid,
        user.email || 'unknown',
        user.displayName || user.email || 'Unknown User',
        'version_published',
        {
          resourceType: 'version',
          resourceId: draftVersion,
          resourceName: `Published version ${draftVersion}`,
          metadata: {
            versionId: draftVersion,
            contentEdits: draftChanges.length,
            catalogCategories: draftCatalogCounts.categories,
            catalogModules: draftCatalogCounts.modules,
            catalogPages: draftCatalogCounts.pages,
          },
        }
      );

      setVersionType('patch'); // Reset to patch after publishing
      await loadData();
    } else {
      setError(result.error || 'Failed to publish version');
    }

    setPublishing(false);
  };

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp.toDate();
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getFieldLabel = (field: string): string => {
    switch (field) {
      case 'title': return 'Title';
      case 'content': return 'Content';
      case 'purpose': return 'Purpose';
      default: return field;
    }
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const totalDraftChanges =
    draftChanges.length + (draftCatalogCounts.categories || 0) + (draftCatalogCounts.modules || 0) + (draftCatalogCounts.pages || 0);

  // Group content edits by module
  const changesByModule = draftChanges.reduce((acc, change) => {
    if (!acc[change.moduleSlug]) {
      acc[change.moduleSlug] = [];
    }
    acc[change.moduleSlug].push(change);
    return acc;
  }, {} as Record<string, ContentEdit[]>);

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Version Manifest</h1>
        <div className={styles.loading}>Loading versions...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Version Manifest</h1>
          <p className={styles.subtitle}>
            Manage content versions and publish changes
          </p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.versionInfo}>
            <div className={styles.versionBadge}>
              <span className={styles.versionLabel}>Live:</span>
              <span className={styles.versionNumber}>{currentVersion ? `v.${currentVersion}` : ''}</span>
            </div>
            <div className={styles.versionBadge}>
              <span className={styles.versionLabel}>Draft:</span>
              <span className={styles.versionNumber}>{draftVersion ? `v.${draftVersion}` : ''}</span>
            </div>
          </div>
          <button
            onClick={handleResetToBase}
            className={styles.resetBaseButton}
            disabled={publishing || updatingVersion || resettingToBase}
            title="Reset versioning to the base starting version (v.0.1.0)"
          >
            {resettingToBase ? 'Resetting…' : '🧱 Reset to v.0.1.0'}
          </button>
        </div>
      </div>

      {/* Version Type Selector */}
      <div className={styles.versionTypeSection}>
        <div className={styles.versionTypeHeader}>
          <h3 className={styles.versionTypeTitle}>Version Type</h3>
          <p className={styles.versionTypeSubtitle}>
            Select the type of changes in this draft
          </p>
        </div>
        <div className={styles.versionTypeButtons}>
          <button
            className={`${styles.versionTypeButton} ${versionType === 'patch' ? styles.active : ''}`}
            onClick={() => handleVersionTypeChange('patch')}
            disabled={updatingVersion || publishing}
          >
            <span className={styles.versionTypeLabel}>Patch</span>
            <span className={styles.versionTypeDescription}>Typos, small phrasing tweaks</span>
          </button>
          <button
            className={`${styles.versionTypeButton} ${versionType === 'minor' ? styles.active : ''}`}
            onClick={() => handleVersionTypeChange('minor')}
            disabled={updatingVersion || publishing}
          >
            <span className={styles.versionTypeLabel}>Minor</span>
            <span className={styles.versionTypeDescription}>Meaningful rewrites/additions</span>
          </button>
          <button
            className={`${styles.versionTypeButton} ${versionType === 'major' ? styles.active : ''}`}
            onClick={() => handleVersionTypeChange('major')}
            disabled={updatingVersion || publishing}
          >
            <span className={styles.versionTypeLabel}>Major</span>
            <span className={styles.versionTypeDescription}>Big restructures or new modules</span>
          </button>
        </div>
      </div>


      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Draft Changes Section */}
      <div className={styles.draftSection}>
        <div className={styles.draftHeader}>
          <div>
            <h2 className={styles.draftTitle}>Draft Changes ({totalDraftChanges})</h2>
            <p className={styles.draftSubtitle}>Changes will be visible to all users after publishing</p>
            <div className={styles.draftCounts}>
              <span className={styles.countPill}>Content edits: {draftChanges.length}</span>
              <span className={styles.countPill}>
                Catalog overlays: {draftCatalogCounts.categories + draftCatalogCounts.modules + draftCatalogCounts.pages} (categories: {draftCatalogCounts.categories}, modules: {draftCatalogCounts.modules}, pages: {draftCatalogCounts.pages})
              </span>
            </div>
          </div>
          {totalDraftChanges > 0 && (
            <button onClick={handlePublish} disabled={publishing} className={styles.publishButton}>
              {publishing
                ? 'Publishing...'
                : `🚀 Publish ${totalDraftChanges} Change${totalDraftChanges !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>

        {totalDraftChanges === 0 ? (
          <div className={styles.emptyState}>
            <p>No draft changes yet. Make edits in the CMS to see them here.</p>
          </div>
        ) : draftChanges.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Catalog overlay changes are ready to publish. (No page content edits yet.)</p>
          </div>
        ) : (
          <div className={styles.changesList}>
            {Object.entries(changesByModule).map(([moduleSlug, changes]) => (
              <div key={moduleSlug} className={styles.moduleGroup}>
                <div className={styles.moduleHeader}>
                  {moduleSlug} ({changes.length})
                </div>
                {changes.map((change) => (
                  <div key={`${change.pageId}-${change.field}`} className={styles.changeRow}>
                    <span className={styles.changeTime}>{formatTimestamp(change.editedAt)}</span>
                    <span className={styles.changeField}>{getFieldLabel(change.field)}</span>
                    <span className={styles.changePageSlug}>{change.pageSlug}</span>
                    <span className={styles.changeAuthor}>by {change.editedBy}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Version History Section */}
      <div className={styles.versionHistorySection}>
        <h2 className={styles.sectionTitle}>Version History</h2>
        <p className={styles.sectionSubtitle}>
          Browse past published versions and their changelogs
        </p>

        {versionHistory.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No published versions yet.</p>
          </div>
        ) : (
          <div className={styles.versionHistoryList}>
            {versionHistory.map((version) => (
              <div key={version.versionKey || version.versionId} className={styles.versionHistoryCard}>
                <div className={styles.versionHistoryHeader}>
                  <div className={styles.versionHistoryInfo}>
                    <div className={styles.versionHistoryNumber}>
                      v.{version.versionId}
                      {(version.versionKey ? version.versionKey === currentVersionKey : version.versionId === currentVersion) && (
                        <span className={styles.currentBadge}>Current</span>
                      )}
                    </div>
                    <div className={styles.versionHistoryMeta}>
                      <span>Published by {version.publishedByName || 'Unknown'}</span>
                      <span className={styles.separator}>•</span>
                      <span>{formatDate(version.publishedAt as string)}</span>
                    </div>
                  </div>
                  <div className={styles.versionHistoryActions}>
                    {(version.versionKey ? version.versionKey !== currentVersionKey : version.versionId !== currentVersion) && (
                      <>
                        <button
                          onClick={() => handleSetLiveVersion(version)}
                          className={styles.setLiveButton}
                          disabled={
                            loadingChangelog ||
                            publishing ||
                            settingLiveVersionKey !== null ||
                            removingVersionKey !== null
                          }
                          title="Set this published version live for all users"
                        >
                          {settingLiveVersionKey === (version.versionKey || version.versionId) ? 'Setting…' : '⏪ Set Live'}
                        </button>
                        <button
                          onClick={() => handleRemoveVersion(version)}
                          className={styles.removeVersionButton}
                          disabled={
                            loadingChangelog ||
                            publishing ||
                            settingLiveVersionKey !== null ||
                            removingVersionKey !== null
                          }
                          title="Remove (archive) this version from the published history"
                        >
                          {removingVersionKey === (version.versionKey || version.versionId) ? 'Removing…' : '🗑 Remove'}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleViewChangelog(version)}
                      className={styles.viewChangelogButton}
                      disabled={loadingChangelog}
                    >
                      📋 View Changelog
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Changelog Modal */}
      {selectedVersion && (
        <div className={styles.modalOverlay} onClick={closeChangelog}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>Version {selectedVersion.versionId} Changelog</h2>
                <p className={styles.modalSubtitle}>
                  Published by {selectedVersion.publishedByName || 'Unknown'} on {formatDate(selectedVersion.publishedAt as string)}
                </p>
              </div>
              <button onClick={closeChangelog} className={styles.closeButton}>
                ✕
              </button>
            </div>

              <div className={styles.modalBody}>
              <div className={styles.releaseNotes}>
                <div className={styles.releaseNotesHeader}>
                  <div className={styles.releaseNotesTitle}>Release notes</div>
                  {canEditVersionNotes && (
                    <button
                      type="button"
                      className={styles.editNotesButton}
                      disabled={savingVersionNotes}
                      onClick={() => {
                        setEditingVersionNotes((v) => !v);
                        setVersionNotesDraft(selectedVersion.description || '');
                      }}
                    >
                      {editingVersionNotes ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                </div>

                {editingVersionNotes ? (
                  <div className={styles.releaseNotesEditor}>
                    <textarea
                      className={styles.releaseNotesTextarea}
                      value={versionNotesDraft}
                      onChange={(e) => setVersionNotesDraft(e.target.value)}
                      placeholder="Describe what changed in this version..."
                      rows={4}
                      disabled={savingVersionNotes}
                    />
                    <div className={styles.releaseNotesActions}>
                      <button
                        type="button"
                        className={styles.saveNotesButton}
                        disabled={savingVersionNotes}
                        onClick={async () => {
                          if (!user) return;
                          setSavingVersionNotes(true);
                          setError(null);

                          const res = await updateVersionDescription(
                            selectedVersion.versionKey || selectedVersion.versionId,
                            versionNotesDraft
                          );
                          if (!res.success) {
                            setError(res.error || 'Failed to update release notes');
                            setSavingVersionNotes(false);
                            return;
                          }

                          setSelectedVersion({ ...selectedVersion, description: versionNotesDraft.trim() });
                          setEditingVersionNotes(false);
                          setSavingVersionNotes(false);
                        }}
                      >
                        {savingVersionNotes ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.releaseNotesText}>
                    {selectedVersion.description ? selectedVersion.description : 'No release notes.'}
                  </div>
                )}
              </div>

              <div className={styles.changelogSummary}>
                {(() => {
                  const total = (selectedVersion.contentEdits?.length || 0) + (selectedVersion.catalogOverlays?.length || 0);
                  return (
                    <span className={styles.changelogCount}>
                      {total} change{total !== 1 ? 's' : ''}
                    </span>
                  );
                })()}
                <div className={styles.draftCounts}>
                  <span className={styles.countPill}>Content edits: {selectedVersion.contentEdits.length}</span>
                  <span className={styles.countPill}>Catalog overlays: {selectedVersion.catalogOverlays.length}</span>
                </div>
              </div>

              {selectedVersion.contentEdits.length === 0 && selectedVersion.catalogOverlays.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No changes recorded for this version.</p>
                </div>
              ) : (
                <>
                  {selectedVersion.catalogOverlays.length > 0 && (
                    <div className={styles.changelogList}>
                      {selectedVersion.catalogOverlays.map((ov, idx) => (
                        <div key={`ov-${idx}`} className={styles.changelogItem}>
                          <div className={styles.changelogItemHeader}>
                            <span className={styles.changelogField}>Catalog</span>
                            <span className={styles.changelogPage}>
                              {ov.kind === 'page' ? `${ov.moduleSlug || ''}/${ov.slug}` : ov.slug}
                              {ov.isDeleted ? ' (deleted)' : ''}
                              {ov.isHidden ? ' (hidden)' : ''}
                            </span>
                            <span className={styles.changelogModule}>{ov.kind}</span>
                          </div>
                          <div className={styles.changelogItemFooter}>
                            <span>Edited by {ov.updatedByName || ov.updatedBy || 'Unknown'}</span>
                            <span>{formatTimestamp(ov.updatedAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedVersion.contentEdits.length > 0 && (
                    <div className={styles.changelogList}>
                      {selectedVersion.contentEdits.map((edit, index) => (
                        <div key={index} className={styles.changelogItem}>
                      <div className={styles.changelogItemHeader}>
                        <span className={styles.changelogField}>{getFieldLabel(edit.field)}</span>
                        <span className={styles.changelogPage}>{edit.pageSlug}</span>
                        <span className={styles.changelogModule}>{edit.moduleSlug}</span>
                      </div>
                      <div className={styles.changelogDiff}>
                        <div className={styles.diffSection}>
                          <div className={styles.diffLabel}>Before:</div>
                          <div className={styles.diffContent}>
                            {edit.originalValue.length > 200
                              ? edit.originalValue.substring(0, 200) + '...'
                              : edit.originalValue}
                          </div>
                        </div>
                        <div className={styles.diffSection}>
                          <div className={styles.diffLabel}>After:</div>
                          <div className={styles.diffContent}>
                            {edit.editedValue.length > 200
                              ? edit.editedValue.substring(0, 200) + '...'
                              : edit.editedValue}
                          </div>
                        </div>
                      </div>
                      <div className={styles.changelogItemFooter}>
                        <span>Edited by {edit.editedBy}</span>
                        <span>{formatTimestamp(edit.editedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
