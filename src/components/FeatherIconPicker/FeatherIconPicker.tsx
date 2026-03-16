import { useEffect, useMemo, useRef, useState } from 'react';
import feather from 'feather-icons';
import { Icon } from '@components/Icon/Icon';
import styles from './FeatherIconPicker.module.css';

export interface FeatherIconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  label?: string;
}

export function FeatherIconPicker({ value, onChange, label }: FeatherIconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const allIcons = useMemo(() => Object.keys(feather.icons), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allIcons;
    return allIcons.filter((name) => name.toLowerCase().includes(q));
  }, [allIcons, query]);

  useEffect(() => {
    if (!isOpen) return;

    // Focus search on open
    searchRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isOpen]);

  const visibleCount = Math.min(filtered.length, 240);

  return (
    <div className={styles.container} ref={containerRef}>
      {label && <div className={styles.label}>{label}</div>}

      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (!isOpen) {
            // Reset the search each time we open to keep the picker fast and predictable.
            setQuery('');
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title={value}
      >
        <span className={styles.triggerIcon}>
          <Icon name={value || 'book'} size={20} />
        </span>
        <span className={styles.triggerText}>{value || 'book'}</span>
        <span className={styles.triggerChevron} aria-hidden>
          ▾
        </span>
      </button>

      {isOpen && (
        <div className={styles.panel} role="dialog" aria-label="Feather icon picker">
          <div className={styles.panelHeader}>
            <input
              ref={searchRef}
              className={styles.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons…"
              aria-label="Search icons"
            />
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
              aria-label="Close icon picker"
              title="Close"
            >
              ✕
            </button>
          </div>

          <div className={styles.grid} role="listbox" aria-label="Feather icon picker">
            {filtered.slice(0, 240).map((name) => {
              const active = name === value;
              return (
                <button
                  key={name}
                  type="button"
                  className={`${styles.cell} ${active ? styles.active : ''}`}
                  onClick={() => {
                    onChange(name);
                    setIsOpen(false);
                  }}
                  title={name}
                  aria-label={name}
                  aria-selected={active}
                  role="option"
                >
                  <Icon name={name} size={18} />
                </button>
              );
            })}
          </div>

          <div className={styles.footer}>
            Showing {visibleCount} of {allIcons.length}
          </div>
        </div>
      )}
    </div>
  );
}
