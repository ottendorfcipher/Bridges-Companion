/**
 * Semantic Icons - Layer 1 Mental Links Strategy
 * 
 * Consistent iconography to trigger schema activation (Schema Theory)
 * Using Feather Icons for cross-platform consistency and HIG compliance
 * 
 * Purpose: Create mental associations that reduce cognitive load
 * 
 * Feather Icons: https://feathericons.com/
 */

import { PrimarySection, PageType } from '@/types/layer1';

/**
 * Primary Navigation Icons (Layer 1)
 * Based on 00-architecture.md navigation structure
 * Mapped to Feather icon names
 */
export const NAVIGATION_ICONS: Record<PrimarySection, { icon: string; label: string }> = {
  learn: {
    icon: 'book-open',
    label: 'Learn'
  },
  compare: {
    icon: 'git-compare',
    label: 'Compare'
  },
  practice: {
    icon: 'message-circle',
    label: 'Practice'
  },
  language: {
    icon: 'message-square',
    label: 'Language'
  },
  reference: {
    icon: 'book',
    label: 'Reference'
  }
};

/**
 * Content Type Icons (Semantic Icons per Layer 1)
 * All mapped to Feather Icons equivalents
 */
export const SEMANTIC_ICONS = {
  // Scripture sources
  scripture: {
    bible: 'book',
    quran: 'moon',
    hadith: 'file-text',
    tafsir: 'book-open',
    other: 'message-square'
  },
  
  // Page types
  pageTypes: {
    A: 'map', // Overview - navigation
    B: 'zap', // Concept - understanding
    C: 'git-compare', // Comparison - contrast
    D: 'message-circle', // Conversation - dialogue
    E: 'message-square', // Language - communication
    F: 'file-text' // Quick Reference - lookup
  },
  
  // Content elements
  content: {
    language: 'message-square',
    conversation: 'message-circle',
    learning: 'award',
    question: 'help-circle',
    answer: 'check-circle',
    warning: 'alert-triangle',
    info: 'info'
  },
  
  // Actions
  actions: {
    search: 'search',
    filter: 'filter',
    bookmark: 'bookmark',
    bookmarked: 'bookmark',
    share: 'share-2',
    back: 'chevron-left',
    forward: 'chevron-right',
    close: 'x',
    menu: 'menu',
    edit: 'edit-2',
    save: 'save',
    delete: 'trash-2',
    settings: 'settings',
    user: 'user',
    users: 'users',
    home: 'home',
    download: 'download',
    upload: 'upload',
    refresh: 'refresh-cw',
    plus: 'plus',
    minus: 'minus',
    more: 'more-horizontal'
  },
  
  // Sensitivity indicators
  sensitivity: {
    low: 'check-circle', // Safe/approachable
    medium: 'alert-circle', // Caution
    high: 'alert-octagon' // Deep theological
  },
  
  // Module categories (based on Layer 1 sidebar structure)
  modules: {
    'islam-basics': 'moon',
    'scripture-authority': 'book-open',
    'jesus-tradition': 'users',
    'scripture-interpretation': 'search',
    'bible-reliability': 'book',
    'christian-beliefs': 'plus',
    'faith-stories': 'user',
    'faith-conversations': 'message-circle',
    'questions-christianity': 'help-circle',
    'language-relationship': 'message-square',
    'glossary': 'book',
    'key-terms': 'list',
    'app-guide': 'help-circle'
  }
} as const;

/**
 * Get Feather icon name for a category
 */
export function getNavigationIcon(category: PrimarySection): string {
  return NAVIGATION_ICONS[category]?.icon || 'circle';
}

/**
 * Get icon for page type
 */
export function getPageTypeIcon(pageType: PageType): string {
  return SEMANTIC_ICONS.pageTypes[pageType] || 'file';
}

/**
 * Get icon for scripture source (Mental Link: Book = Scripture)
 * Returns Feather icon name
 */
export function getScriptureIcon(source: string): string {
  const sourceMap: Record<string, string> = {
    bible: SEMANTIC_ICONS.scripture.bible,
    quran: SEMANTIC_ICONS.scripture.quran,
    hadith: SEMANTIC_ICONS.scripture.hadith,
    other: SEMANTIC_ICONS.scripture.other
  };
  return sourceMap[source] || SEMANTIC_ICONS.scripture.other;
}

/**
 * Get sensitivity level icon
 */
export function getSensitivityIcon(level: 'low' | 'medium' | 'high'): string {
  return SEMANTIC_ICONS.sensitivity[level];
}

/**
 * Icon component props for Feather Icons
 */
export interface IconName {
  name: string;
  accessibilityLabel?: string;
}

/**
 * Get icon name with accessibility label
 */
export function getIconWithLabel(
  type: 'navigation' | 'pageType' | 'scripture' | 'sensitivity' | 'action' | 'module',
  key: string
): IconName {
  let name = '';
  let label = '';

  switch (type) {
    case 'navigation': {
      const nav = NAVIGATION_ICONS[key as PrimarySection];
      name = nav?.icon || 'circle';
      label = nav?.label || key;
      break;
    }
    case 'pageType':
      name = getPageTypeIcon(key as PageType);
      label = `${key} page type`;
      break;
    case 'scripture':
      name = getScriptureIcon(key);
      label = `${key} scripture`;
      break;
    case 'sensitivity':
      name = getSensitivityIcon(key as any);
      label = `${key} sensitivity`;
      break;
    case 'action':
      name = (SEMANTIC_ICONS.actions as any)[key] || 'circle';
      label = key;
      break;
    case 'module':
      name = (SEMANTIC_ICONS.modules as any)[key] || 'book';
      label = key.replace(/-/g, ' ');
      break;
  }

  return { name, accessibilityLabel: label };
}

/**
 * Get list of all available Feather icon names
 * Useful for documentation and validation
 */
export function getAvailableIconNames(): string[] {
  const allIcons = new Set<string>();
  
  // Collect all icon names from all categories
  Object.values(NAVIGATION_ICONS).forEach(nav => allIcons.add(nav.icon));
  Object.values(SEMANTIC_ICONS.scripture).forEach(icon => allIcons.add(icon));
  Object.values(SEMANTIC_ICONS.pageTypes).forEach(icon => allIcons.add(icon));
  Object.values(SEMANTIC_ICONS.content).forEach(icon => allIcons.add(icon));
  Object.values(SEMANTIC_ICONS.actions).forEach(icon => allIcons.add(icon));
  Object.values(SEMANTIC_ICONS.sensitivity).forEach(icon => allIcons.add(icon));
  Object.values(SEMANTIC_ICONS.modules).forEach(icon => allIcons.add(icon));
  
  return Array.from(allIcons).sort();
}
