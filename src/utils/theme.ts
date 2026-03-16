/**
 * Theme Management System
 * Handles dark/light mode with localStorage persistence and system preference detection
 */

export type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'bridge_companion_theme';

/**
 * Get the current theme from localStorage or default to system
 */
export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch (error) {
    console.error('Error loading theme:', error);
  }
  return 'system';
}

/**
 * Save theme preference to localStorage
 */
export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    console.error('Error saving theme:', error);
  }
}

/**
 * Get system color scheme preference
 */
export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/**
 * Get the effective theme (resolving 'system' to actual theme)
 */
export function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

/**
 * Apply theme to document
 */
export function applyTheme(theme: Theme): void {
  const effectiveTheme = getEffectiveTheme(theme);
  
  // Remove existing theme classes
  document.documentElement.classList.remove('light-theme', 'dark-theme');
  
  // Add new theme class
  document.documentElement.classList.add(`${effectiveTheme}-theme`);
  
  // Update meta theme-color for mobile browsers
  updateThemeColor(effectiveTheme);
}

/**
 * Update meta theme-color for mobile browsers
 */
function updateThemeColor(theme: 'light' | 'dark'): void {
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    // Use surface elevated color for theme-color
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#252321' : '#FFFFFF');
  }
}

/**
 * Initialize theme on app load
 */
export function initializeTheme(): Theme {
  const storedTheme = getStoredTheme();
  applyTheme(storedTheme);
  
  // Listen for system theme changes if using system theme
  if (storedTheme === 'system') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      applyTheme('system');
    });
  }
  
  return storedTheme;
}

/**
 * Toggle between light and dark (not using system)
 */
export function toggleTheme(currentTheme: Theme): Theme {
  const effectiveTheme = getEffectiveTheme(currentTheme);
  const newTheme = effectiveTheme === 'dark' ? 'light' : 'dark';
  setStoredTheme(newTheme);
  applyTheme(newTheme);
  return newTheme;
}
