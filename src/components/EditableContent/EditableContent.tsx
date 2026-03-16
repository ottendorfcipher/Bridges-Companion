import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { useEditMode } from '@contexts/EditModeContext';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { RichTextEditor } from '../RichTextEditor/RichTextEditor';
import { saveContentEdit, archiveContentEdit } from '@utils/contentManagement';
import { isLikelyUnschemedExternalUrl, normalizeHrefForNavigation } from '@utils/links';
import { markdownToHtml, isMarkdown } from '@utils/markdown';
import styles from './EditableContent.module.css';

interface EditableContentProps {
  pageId: number;
  moduleSlug: string;
  pageSlug: string;
  resourceName: string; // Human-readable name for activity log
  field: 'title' | 'content' | 'purpose';
  value: string;
  originalValue: string; // The unedited SQLite value (for undo)
  /**
   * Whether there is an active edit for the current draft version for this page+field.
   * Used to decide whether to show the revert button.
   */
  hasDraftEdit?: boolean;
  /**
   * If true, editing is enabled even when global Edit Mode is off.
   * Intended for Admin CMS views.
   */
  forceEditMode?: boolean;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'div' | 'span';
  className?: string;
  inline?: boolean; // For inline elements like accordion titles
  onSave?: (newValue: string) => void;
  onUndo?: () => void;
}

/**
 * EditableContent - Wraps content with edit capability for admins/editors
 * Shows edit icon next to content, opens WYSIWYG editor on click
 */
function BasicTextEditor({
  field,
  initialValue,
  onSave,
  onCancel,
  saving,
}: {
  field: 'title' | 'content' | 'purpose';
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(initialValue);

  return (
    <div className={styles.basicEditor}>
      <div className={styles.basicEditorHeader}>
        <div className={styles.basicEditorTitle}>Basic editor</div>
        <div className={styles.basicEditorSubtitle}>
          The rich editor failed to load on this device/browser. You can still edit and save.
        </div>
      </div>

      {field === 'title' ? (
        <input
          className={styles.basicEditorInput}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
      ) : (
        <textarea
          className={styles.basicEditorTextarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          autoFocus
        />
      )}

      <div className={styles.basicEditorActions}>
        <button
          onClick={onCancel}
          className={styles.basicEditorCancel}
          disabled={saving}
          type="button"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(draft)}
          className={styles.basicEditorSave}
          disabled={saving}
          type="button"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

export function EditableContent({
  pageId,
  moduleSlug,
  pageSlug,
  resourceName,
  field,
  value,
  originalValue,
  hasDraftEdit = false,
  forceEditMode = false,
  as = 'div',
  className = '',
  inline = false,
  onSave,
  onUndo,
}: EditableContentProps) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const { editModeEnabled } = useEditMode();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUndoButton, setShowUndoButton] = useState(false);
  const [showUndoToast, setShowUndoToast] = useState(false);

  // Can only edit if user has permission AND edit mode is enabled
  // (or forceEditMode is true for Admin CMS views)
  const canEdit = permissions.canEditContent() && (editModeEnabled || forceEditMode);

  // If there is no longer a draft edit (e.g., version published/changed), hide the undo affordance.
  useEffect(() => {
    if (!canEdit) return;
    if (!hasDraftEdit) {
      setShowUndoButton(false);
    }
  }, [canEdit, hasDraftEdit]);

  const handleSave = async (newValue: string) => {
    if (!user) return;

    setIsSaving(true);
    setError(null);

    const result = await saveContentEdit(
      pageId,
      moduleSlug,
      pageSlug,
      resourceName,
      field,
      originalValue, // original value from SQLite
      newValue, // edited value
      user.uid,
      user.email || 'unknown',
      user.displayName || user.email || 'Unknown User'
    );

    if (result.success) {
      setIsEditing(false);
      setShowUndoButton(true);
      setShowUndoToast(true);
      if (onSave) {
        onSave(newValue);
      }
      // Hide undo emphasis after 10 seconds
      setTimeout(() => {
        setShowUndoButton(false);
        setShowUndoToast(false);
      }, 10000);
    } else {
      setError(result.error || 'Failed to save changes');
    }

    setIsSaving(false);
  };

  const handleUndo = async () => {
    if (!user) return;

    setIsSaving(true);
    setError(null);

    const result = await archiveContentEdit(
      pageId,
      field,
      resourceName,
      user.uid,
      user.email || 'unknown',
      user.displayName || user.email || 'Unknown User'
    );

    if (result.success) {
      setShowUndoButton(false);
      setShowUndoToast(false);
      if (onUndo) {
        onUndo();
      }
    } else {
      setError(result.error || 'Failed to undo changes');
    }

    setIsSaving(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
  };

  // NOTE: Hooks must be called unconditionally.
  // Compute displayValue before any early returns to avoid React invariant #300
  // ("Rendered fewer hooks than expected").
  const stripHtmlTags = (html: string) => html.replace(/<[^>]*>/g, '');

  // Convert markdown to HTML if needed (memoized to avoid re-parsing)
  const htmlValue = useMemo(() => {
    if (isMarkdown(value)) {
      return markdownToHtml(value);
    }
    return value;
  }, [value]);

  // For inline elements (like titles), strip HTML tags
  const displayValue = inline ? stripHtmlTags(htmlValue) : htmlValue;

  // Rich editor should always start from what the user *sees* (HTML), not markdown source.
  // For inline fields (titles), keep it plain text.
  const editorInitialValue = useMemo(() => {
    if (inline || field === 'title') return stripHtmlTags(htmlValue);
    return htmlValue;
  }, [field, htmlValue, inline]);

  // If editing, show the editor
  if (isEditing) {
    return (
      <div className={styles.editorContainer}>
        {error && (
          <div className={styles.error}>
            <span className={styles.errorIcon}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <ErrorBoundary
          fallback={
            <BasicTextEditor
              field={field}
              initialValue={editorInitialValue}
              onSave={handleSave}
              onCancel={handleCancel}
              saving={isSaving}
            />
          }
        >
          <RichTextEditor
            content={editorInitialValue}
            onSave={handleSave}
            onCancel={handleCancel}
            saving={isSaving}
          />
        </ErrorBoundary>
      </div>
    );
  }

  // Render the content with edit button (if user has permission)
  const Component = as;

  const handleRenderedLinkClickCapture = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const a = target?.closest('a') as HTMLAnchorElement | null;
    if (!a) return;

    const href = a.getAttribute('href') || '';
    if (!href) return;

    if (!isLikelyUnschemedExternalUrl(href)) return;

    const normalized = normalizeHrefForNavigation(href);
    if (!normalized) return;

    e.preventDefault();
    e.stopPropagation();
    window.open(normalized, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className={`${styles.wrapper} ${inline ? styles.inline : ''}`}
      onClickCapture={handleRenderedLinkClickCapture}
    >
      {error && (
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {inline ? (
        <Component className={`${className} ${canEdit ? styles.editable : ''}`}>
          {displayValue}
        </Component>
      ) : (
        <Component
          className={`${className} ${canEdit ? styles.editable : ''}`}
          dangerouslySetInnerHTML={{ __html: displayValue }}
        />
      )}

      {canEdit && showUndoToast && (
        <div className={styles.undoToast} role="status" aria-live="polite">
          <span className={styles.undoToastText}>Saved.</span>
          <button
            type="button"
            className={styles.undoToastButton}
            onClick={handleUndo}
            disabled={isSaving}
          >
            Undo
          </button>
        </div>
      )}

      {canEdit && (
        <div className={styles.buttonGroup}>
          <button
            className={styles.editButton}
            onClick={() => setIsEditing(true)}
            title="Edit this content"
            aria-label="Edit content"
            disabled={isSaving}
            type="button"
          >
            ✏️
          </button>
          {(showUndoButton || hasDraftEdit) && (
            <button
              className={`${styles.undoButton} ${showUndoButton ? styles.highlight : ''}`}
              onClick={handleUndo}
              title="Undo saved edit (revert to original)"
              aria-label="Undo saved edit"
              disabled={isSaving}
              type="button"
            >
              ↶
            </button>
          )}
        </div>
      )}
    </div>
  );
}
