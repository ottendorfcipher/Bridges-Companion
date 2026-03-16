import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@hooks/useAuth';
import {
  assignSectionToTag,
  getAllAssignedTags,
  isSectionAssignedToTag,
  removeSectionFromTag,
  type AssignedTag,
} from '@utils/assignedTags';
import { Icon } from '@components/Icon/Icon';
import styles from './AssignedTagPicker.module.css';

interface AssignedTagPickerProps {
  sectionId: number;
  sectionTitle: string;
  categorySlug: string;
}

export function AssignedTagPicker({ sectionId, sectionTitle, categorySlug }: AssignedTagPickerProps) {
  const { user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<AssignedTag[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busyTagIds, setBusyTagIds] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const [panelPlacement, setPanelPlacement] = useState<'up' | 'down'>('up');

  const assignedCount = useMemo(() => Object.values(checked).filter(Boolean).length, [checked]);

  const updatePanelPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();

    const gutter = 12;
    const gap = 8;
    const width = Math.min(280, window.innerWidth - gutter * 2);

    // Right-align to the trigger, clamped within viewport
    const left = Math.max(gutter, Math.min(rect.right - width, window.innerWidth - width - gutter));

    const estimatedHeight = 360;
    const above = rect.top - gap - gutter;
    const below = window.innerHeight - rect.bottom - gap - gutter;

    const shouldOpenUp = above >= estimatedHeight && above >= below;
    const placement: 'up' | 'down' = shouldOpenUp ? 'up' : 'down';
    setPanelPlacement(placement);

    if (placement === 'up') {
      // Use bottom positioning so we don't need exact panel height.
      setPanelStyle({
        position: 'fixed',
        left,
        width,
        bottom: window.innerHeight - rect.top + gap,
        zIndex: 2000,
      });
    } else {
      setPanelStyle({
        position: 'fixed',
        left,
        width,
        top: rect.bottom + gap,
        zIndex: 2000,
      });
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    // Initial position
    updatePanelPosition();

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const trigger = triggerRef.current;
      const panel = panelRef.current;

      if (trigger && trigger.contains(target)) return;
      if (panel && panel.contains(target)) return;

      setIsOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const onReposition = () => {
      updatePanelPosition();
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    // capture=true to catch scrolls within nested containers
    window.addEventListener('scroll', onReposition, true);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [isOpen]);

  const load = async () => {
    setLoading(true);

    const tagsRes = await getAllAssignedTags();
    if (!tagsRes.success || !tagsRes.data) {
      setTags([]);
      setChecked({});
      setLoading(false);
      return;
    }

    setTags(tagsRes.data);

    const entries = await Promise.all(
      tagsRes.data.map(async (t) => {
        const res = await isSectionAssignedToTag(t.id, sectionId);
        return [t.id, Boolean(res.success && res.data)] as const;
      })
    );

    setChecked(Object.fromEntries(entries));
    setLoading(false);
  };

  const handleToggleOpen = async () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      await load();
      // Recompute after async load (panel content/scrollbars can affect ideal placement)
      updatePanelPosition();
    }
  };

  const setBusy = (tagId: string, value: boolean) => {
    setBusyTagIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(tagId);
      else next.delete(tagId);
      return next;
    });
  };

  const handleToggleTag = async (tagId: string) => {
    if (!user) return;
    if (busyTagIds.has(tagId)) return;

    const isChecked = Boolean(checked[tagId]);

    setBusy(tagId, true);

    const res = isChecked
      ? await removeSectionFromTag({ tagId, sectionId })
      : await assignSectionToTag({
          tagId,
          sectionId,
          sectionTitle,
          categorySlug,
          assignedBy: {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          },
        });

    if (res.success) {
      setChecked((prev) => ({ ...prev, [tagId]: !isChecked }));
    }

    setBusy(tagId, false);
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        onClick={handleToggleOpen}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Assign to tag"
      >
        <Icon name="tag" size={18} />
        <span className={styles.label}>Assign</span>
        {assignedCount > 0 && <span className={styles.badge}>{assignedCount}</span>}
        <Icon name={isOpen ? 'chevron-down' : 'chevron-up'} size={18} />
      </button>

      {isOpen &&
        panelStyle &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.panel}
            style={panelStyle}
            data-placement={panelPlacement}
            role="dialog"
            aria-label="Assign tags"
          >
            {loading ? (
              <div className={styles.loading}>Loading tags…</div>
            ) : tags.length === 0 ? (
              <div className={styles.empty}>No tags yet. Create one in Admin → Assignments.</div>
            ) : (
              <div className={styles.list}>
                {tags.map((t) => {
                  const isChecked = Boolean(checked[t.id]);
                  const isBusy = busyTagIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      className={styles.row}
                      onClick={() => handleToggleTag(t.id)}
                      disabled={isBusy}
                      aria-pressed={isChecked}
                    >
                      <span className={styles.dot} style={{ background: t.color }} />
                      <span className={styles.name}>{t.name || 'Untitled tag'}</span>
                      <span className={styles.right}>
                        <input type="checkbox" checked={isChecked} readOnly aria-label={t.name} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className={styles.manageRow}>
              <button
                className={styles.manageButton}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('bridge:open-admin-assignments'));
                  setIsOpen(false);
                }}
              >
                <Icon name="settings" size={16} />
                <span>Manage tags</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
