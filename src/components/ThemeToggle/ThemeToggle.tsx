import { useState, useEffect } from 'react';
import { Icon } from '../Icon/Icon';
import { getStoredTheme, toggleTheme, getEffectiveTheme, type Theme } from '@utils/theme';
import styles from './ThemeToggle.module.css';

interface ThemeToggleProps {
  variant?: 'button' | 'inline';
}

/**
 * Theme Toggle Component
 * Switches between light and dark mode with visual feedback
 */
export function ThemeToggle({ variant = 'button' }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>('system');
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const currentTheme = getStoredTheme();
    setTheme(currentTheme);
    setEffectiveTheme(getEffectiveTheme(currentTheme));
  }, []);

  const handleToggle = () => {
    const newTheme = toggleTheme(theme);
    setTheme(newTheme);
    setEffectiveTheme(getEffectiveTheme(newTheme));
  };

  if (variant === 'inline') {
    return (
      <button
        className={styles.inlineToggle}
        onClick={handleToggle}
        aria-label={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <Icon name={effectiveTheme === 'dark' ? 'sun' : 'moon'} size={20} />
        <span className={styles.label}>
          {effectiveTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </span>
      </button>
    );
  }

  return (
    <button
      className={styles.toggle}
      onClick={handleToggle}
      aria-label={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <Icon name={effectiveTheme === 'dark' ? 'sun' : 'moon'} size={24} />
    </button>
  );
}
