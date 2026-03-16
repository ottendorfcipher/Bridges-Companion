import { SensitivityLevel } from '@/types/layer1';
import styles from './SensitivityBadge.module.css';

export interface SensitivityBadgeProps {
  level: SensitivityLevel;
  showLabel?: boolean;
  showBorder?: boolean;
  className?: string;
}

// Layer 1 Language - From core_changes_ui_12_28_25.pdf
const sensitivityLabels: Record<SensitivityLevel, string> = {
  low: 'Safe for Open Dialogue',
  medium: 'Requires Nuance',
  high: 'Advanced Topics'
};

const sensitivityDescriptions: Record<SensitivityLevel, string> = {
  low: 'This topic invites open dialogue and is generally approachable',
  medium: 'This topic requires cultural sensitivity and careful framing',
  high: 'This topic involves deep theological divergence; proceed thoughtfully'
};

/**
 * SensitivityBadge - Layer 1 Contextual Relevance Indicator
 * 
 * Color-coded borders/icons indicate "Social Safety" of a topic
 * Based on Yerkes-Dodson Law (Eustress) - from core_changes_ui_12_28_25.pdf
 * 
 * Color System (Layer 1):
 * - Teal (#30B0C7): Low sensitivity - Invites open dialogue
 * - Orange (#FF9500): Medium sensitivity - Requires nuance  
 * - Purple (#AF52DE): High sensitivity - Deep theological divergence
 * 
 * Note: Red (danger) is avoided per Layer 1 design guidelines
 */
export function SensitivityBadge({ 
  level, 
  showLabel = true,
  showBorder = false,
  className = ''
}: SensitivityBadgeProps) {
  return (
    <div 
      className={`${styles.badge} ${styles[level]} ${showBorder ? styles.bordered : ''} ${className}`}
      role="status"
      aria-label={`Sensitivity: ${sensitivityLabels[level]}`}
      title={sensitivityDescriptions[level]}
    >
      <span className={styles.indicator} aria-hidden="true" />
      {showLabel && (
        <span className={styles.label}>
          {sensitivityLabels[level]}
        </span>
      )}
    </div>
  );
}
