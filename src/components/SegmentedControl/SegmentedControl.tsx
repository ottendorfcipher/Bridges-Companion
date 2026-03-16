import { useState } from 'react';
import styles from './SegmentedControl.module.css';

export interface SegmentedControlOption {
  id: string;
  label: string;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  defaultValue?: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
}

/**
 * SegmentedControl - Layer 1 Type C Component
 * 
 * Mobile State: Toggle between ChristianView | MuslimView
 * Content changes below without page reload (Graphic Organizers - Dual Coding Theory)
 * 
 * Desktop/Tablet State: Used as visual indicator alongside side-by-side grid
 * 
 * Rationale: Reducing visual noise allows user to focus on one paradigm at a time
 * while keeping the counterpart one tap away.
 * 
 * From core_changes_ui_12_28_25.pdf page 3
 */
export function SegmentedControl({ 
  options, 
  defaultValue, 
  onChange,
  'aria-label': ariaLabel 
}: SegmentedControlProps) {
  const [selected, setSelected] = useState(defaultValue || options[0]?.id);

  const handleSelect = (id: string) => {
    setSelected(id);
    onChange(id);
  };

  return (
    <div 
      className={styles.segmentedControl} 
      role="tablist"
      aria-label={ariaLabel || 'View selection'}
    >
      {options.map((option) => {
        const isSelected = selected === option.id;
        
        return (
          <button
            key={option.id}
            className={`${styles.segment} ${isSelected ? styles.selected : ''}`}
            onClick={() => handleSelect(option.id)}
            role="tab"
            aria-selected={isSelected}
            aria-controls={`panel-${option.id}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
