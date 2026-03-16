import { useState } from 'react';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import styles from './ContrastMatrix.module.css';

export interface ContrastMatrixProps {
  viewA: string | React.ReactNode;
  viewB: string | React.ReactNode;
  labelA?: string;
  labelB?: string;
  title?: string;
}

/**
 * ComparisonMatrix (Type C) - Layer 1 Core Changes
 * 
 * Implements "Graphic Organizers" strategy (Dual Coding Theory)
 * Mobile State: Segmented Control at top - View A | View B toggle
 * Desktop/Tablet State: Two-column grid side-by-side
 * 
 * Rationale: Reducing visual noise allows user to focus on one paradigm at a time
 * while keeping the counterpart one tap away
 * 
 * Visual anchors on both sides support Pinball Pattern reading
 */
export function ContrastMatrix({ viewA, viewB, labelA = 'Perspective A', labelB = 'Perspective B', title }: ContrastMatrixProps) {
  const [selectedView, setSelectedView] = useState<string>('viewA'); // Default to first view

  return (
    <div className={styles.matrix}>
      {title && <h4 className={styles.matrixTitle}>{title}</h4>}
      
      {/* Mobile Toggle - Hidden on tablet+ */}
      <div className={styles.mobileToggle}>
        <SegmentedControl
          options={[
            { id: 'viewA', label: labelA },
            { id: 'viewB', label: labelB }
          ]}
          defaultValue="viewA"
          onChange={setSelectedView}
          aria-label="Perspective comparison"
        />
      </div>

      {/* Mobile: Single column view based on selection - content changes without reload */}
      <div className={styles.mobileView}>
        {selectedView === 'viewA' ? (
          <div className={styles.matrixColumn}>
            <div className={`${styles.columnHeader} ${styles.viewA}`}>
              <span className={styles.columnLabel}>{labelA}</span>
            </div>
            <div className={styles.columnContent}>
              {typeof viewA === 'string' ? (
                <div dangerouslySetInnerHTML={{ __html: viewA }} />
              ) : (
                viewA
              )}
            </div>
          </div>
        ) : (
          <div className={styles.matrixColumn}>
            <div className={`${styles.columnHeader} ${styles.viewB}`}>
              <span className={styles.columnLabel}>{labelB}</span>
            </div>
            <div className={styles.columnContent}>
              {typeof viewB === 'string' ? (
                <div dangerouslySetInnerHTML={{ __html: viewB }} />
              ) : (
                viewB
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tablet/Desktop: Two-column grid side-by-side with visual anchors (Pinball Pattern) */}
      <div className={styles.matrixGrid}>
        <div className={styles.matrixColumn}>
          <div className={`${styles.columnHeader} ${styles.viewA}`}>
            <span className={styles.columnLabel}>{labelA}</span>
          </div>
          <div className={styles.columnContent}>
            {typeof viewA === 'string' ? (
              <div dangerouslySetInnerHTML={{ __html: viewA }} />
            ) : (
              viewA
            )}
          </div>
        </div>
        
        <div className={styles.matrixDivider} />
        
        <div className={styles.matrixColumn}>
          <div className={`${styles.columnHeader} ${styles.viewB}`}>
            <span className={styles.columnLabel}>{labelB}</span>
          </div>
          <div className={styles.columnContent}>
            {typeof viewB === 'string' ? (
              <div dangerouslySetInnerHTML={{ __html: viewB }} />
            ) : (
              viewB
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
