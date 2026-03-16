import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { getAllUsers } from '@utils/userProfile';
import { trackUserAction } from '@utils/userActionTracker';
import {
  createAssignedTag,
  deleteAssignedTagAndSections,
  getAllAssignedTags,
  getAssignedSectionsForTag,
  removeSectionFromTag,
  updateAssignedTag,
  type AssignedSection,
  type AssignedTag,
} from '@utils/assignedTags';
import type { User } from '@/types/user';
import styles from './AssignmentsView.module.css';

export function AssignmentsView() {
  const { user } = useAuth();
  const permissions = usePermissions();

  const [tags, setTags] = useState<AssignedTag[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  const [assignedSections, setAssignedSections] = useState<AssignedSection[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#007AFF');

  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#007AFF');
  const [editMemberUserIds, setEditMemberUserIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const selectedTag = useMemo(
    () => (selectedTagId ? tags.find((t) => t.id === selectedTagId) || null : null),
    [selectedTagId, tags]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [tagsRes, usersRes] = await Promise.all([getAllAssignedTags(), getAllUsers()]);

    if (!tagsRes.success) {
      setError(tagsRes.error || 'Failed to load assigned tags');
      setLoading(false);
      return;
    }

    if (!usersRes.success) {
      setError(usersRes.error || 'Failed to load users');
      setLoading(false);
      return;
    }

    setTags(tagsRes.data || []);
    setUsers(usersRes.data || []);

    setLoading(false);
  }, []);

  const loadAssignedSections = useCallback(async (tagId: string) => {
    const res = await getAssignedSectionsForTag(tagId);
    if (res.success && res.data) {
      setAssignedSections(res.data);
    } else {
      setAssignedSections([]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadAll();
  }, [user, loadAll]);

  useEffect(() => {
    if (!selectedTag) {
      setEditName('');
      setEditColor('#007AFF');
      setEditMemberUserIds(new Set());
      setAssignedSections([]);
      return;
    }

    setEditName(selectedTag.name);
    setEditColor(selectedTag.color);
    setEditMemberUserIds(new Set(selectedTag.memberUserIds));

    loadAssignedSections(selectedTag.id);
  }, [selectedTag, loadAssignedSections]);

  const canManageAssignments = permissions.hasPermission('admin.full_access');

  const handleCreateTag = async () => {
    if (!user) return;
    if (!canManageAssignments) return;

    const name = newTagName.trim();
    if (!name) return;

    setSaving(true);
    setError(null);

    const res = await createAssignedTag({
      name,
      color: newTagColor,
      memberUserIds: [],
      createdBy: user.uid,
    });

    if (!res.success || !res.data) {
      setError(res.error || 'Failed to create tag');
      setSaving(false);
      return;
    }

    setNewTagName('');

    const tagsRes = await getAllAssignedTags();
    if (tagsRes.success && tagsRes.data) {
      setTags(tagsRes.data);
      setSelectedTagId(res.data.id);
    }

    setSaving(false);
  };

  const handleSaveTag = async () => {
    if (!selectedTag) return;
    if (!canManageAssignments) return;

    setSaving(true);
    setError(null);

    const res = await updateAssignedTag(selectedTag.id, {
      name: editName.trim(),
      color: editColor,
      memberUserIds: Array.from(editMemberUserIds),
    });

    if (!res.success) {
      setError(res.error || 'Failed to save tag');
      setSaving(false);
      return;
    }

    const tagsRes = await getAllAssignedTags();
    if (tagsRes.success && tagsRes.data) {
      setTags(tagsRes.data);
    }

    // Record the save, then close the tag details panel.
    trackUserAction(user, 'assignments_tag_saved', {
      resourceType: 'tag',
      resourceId: selectedTag.id,
      resourceName: editName.trim() || selectedTag.name,
      metadata: {
        memberCount: editMemberUserIds.size,
      },
      immediate: true,
    });

    setSelectedTagId(null);
    setSaving(false);
  };

  const handleDeleteTag = async () => {
    if (!selectedTag) return;
    if (!canManageAssignments) return;

    const ok = window.confirm(`Delete tag “${selectedTag.name}”? This also removes all assigned sections under it.`);
    if (!ok) return;

    setSaving(true);
    setError(null);

    const res = await deleteAssignedTagAndSections(selectedTag.id);
    if (!res.success) {
      setError(res.error || 'Failed to delete tag');
      setSaving(false);
      return;
    }

    setSelectedTagId(null);

    const tagsRes = await getAllAssignedTags();
    if (tagsRes.success && tagsRes.data) {
      setTags(tagsRes.data);
    }

    setSaving(false);
  };

  const handleToggleMember = (uid: string) => {
    setEditMemberUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleRemoveAssignedSection = async (sectionId: number) => {
    if (!selectedTag) return;
    if (!canManageAssignments) return;

    const res = await removeSectionFromTag({ tagId: selectedTag.id, sectionId });
    if (!res.success) {
      setError(res.error || 'Failed to remove assignment');
      return;
    }

    loadAssignedSections(selectedTag.id);
  };

  if (!canManageAssignments) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Assignments</h1>
        <div className={styles.notice}>
          You don’t have permission to manage assignments.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Assignments</h1>
        <div className={styles.loading}>Loading…</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Assignments</h1>
          <p className={styles.subtitle}>Create tags (groups), add members, and assign sections to tags.</p>
        </div>
      </div>

      {error && (
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠️</span>
          <p>{error}</p>
          <button onClick={() => setError(null)} className={styles.errorDismiss} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className={styles.grid}>
        <section className={styles.leftPane} aria-label="Tags">
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Tags</h2>

            <div className={styles.createRow}>
              <input
                className={styles.input}
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="New tag name"
                aria-label="New tag name"
              />
              <input
                className={styles.color}
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                aria-label="Tag color"
              />
              <button
                className={styles.primaryButton}
                onClick={handleCreateTag}
                disabled={saving || !newTagName.trim()}
              >
                Create
              </button>
            </div>

            <div className={styles.tagList}>
              {tags.length === 0 ? (
                <div className={styles.empty}>No tags yet.</div>
              ) : (
                tags.map((t) => (
                  <button
                    key={t.id}
                    className={`${styles.tagRow} ${selectedTagId === t.id ? styles.activeTagRow : ''}`}
                    onClick={() => setSelectedTagId(t.id)}
                  >
                    <span className={styles.tagDot} style={{ background: t.color }} />
                    <span className={styles.tagName}>{t.name || 'Untitled tag'}</span>
                    <span className={styles.tagMeta}>{t.memberUserIds.length}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section className={styles.rightPane} aria-label="Tag details">
          {!selectedTag ? (
            <div className={styles.card}>
              <div className={styles.empty}>Select a tag to manage members and assigned sections.</div>
            </div>
          ) : (
            <>
              <div className={styles.card}>
                <div className={styles.cardHeaderRow}>
                  <h2 className={styles.cardTitle}>Tag Details</h2>
                  <button className={styles.dangerButton} onClick={handleDeleteTag} disabled={saving}>
                    Delete
                  </button>
                </div>

                <div className={styles.formRow}>
                  <label className={styles.label}>
                    Name
                    <input
                      className={styles.input}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </label>

                  <label className={styles.label}>
                    Color
                    <input
                      className={styles.color}
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                    />
                  </label>
                </div>

                <div className={styles.membersSection}>
                  <h3 className={styles.sectionTitle}>Members</h3>
                  <div className={styles.membersList}>
                    {users.map((u) => (
                      <label key={u.uid} className={styles.memberRow}>
                        <input
                          type="checkbox"
                          checked={editMemberUserIds.has(u.uid)}
                          onChange={() => handleToggleMember(u.uid)}
                        />
                        <span className={styles.memberName}>{u.displayName || u.email || u.uid}</span>
                        <span className={styles.memberMeta}>{u.role}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.actionsRow}>
                  <button className={styles.primaryButton} onClick={handleSaveTag} disabled={saving}>
                    Save Changes
                  </button>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHeaderRow}>
                  <h2 className={styles.cardTitle}>Assigned Sections</h2>
                  <div className={styles.smallMeta}>{assignedSections.length}</div>
                </div>

                {assignedSections.length === 0 ? (
                  <div className={styles.empty}>No sections assigned under this tag yet.</div>
                ) : (
                  <div className={styles.assignedList}>
                    {assignedSections.map((s) => (
                      <div key={s.sectionId} className={styles.assignedRow}>
                        <div className={styles.assignedInfo}>
                          <div className={styles.assignedTitle}>{s.sectionTitle || `Section ${s.sectionId}`}</div>
                          <div className={styles.assignedMeta}>
                            ID {s.sectionId}
                            {s.categorySlug ? ` • ${s.categorySlug}` : ''}
                            {s.assignedAt ? ` • ${new Date(s.assignedAt).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                        <button
                          className={styles.secondaryButton}
                          onClick={() => handleRemoveAssignedSection(s.sectionId)}
                          title="Remove assignment"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
