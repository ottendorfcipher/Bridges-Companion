import { useEditMode } from '@contexts/EditModeContext';
import { usePermissions } from '@hooks/usePermissions';
import styles from './EditModeToggle.module.css';

/**
 * EditModeToggle - iOS-style toggle switch for edit mode
 * Only visible to users with content.edit permission
 * 
 * Follows NN/g principles:
 * - Clear affordance (looks like a toggle switch)
 * - State visibility (color/position indicate current state)
 * - Action clarity (label shows result of action)
 */
export function EditModeToggle() {
  const { editModeEnabled, toggleEditMode } = useEditMode();
  const permissions = usePermissions();

  // Only show to users who can edit content
  if (!permissions.canEditContent()) {
    return null;
  }

  return (
    <div className={styles.container}>
      <button
        onClick={toggleEditMode}
        className={styles.toggle}
        role="switch"
        aria-checked={editModeEnabled}
        aria-label={editModeEnabled ? 'Switch to view mode' : 'Switch to edit mode'}
        title={editModeEnabled ? 'Switch to view mode' : 'Switch to edit mode'}
      >
        {/* Toggle Track */}
        <span className={`${styles.track} ${editModeEnabled ? styles.trackActive : ''}`}>
          {/* Toggle Thumb */}
          <span className={`${styles.thumb} ${editModeEnabled ? styles.thumbActive : ''}`}>
            <span className={styles.thumbIcon}>
              {editModeEnabled ? '✏️' : '👁️'}
            </span>
          </span>
        </span>
        
        {/* Label - shows current state clearly */}
        <span className={styles.label}>
          {editModeEnabled ? 'Editing' : 'Viewing'}
        </span>
      </button>
    </div>
  );
}
