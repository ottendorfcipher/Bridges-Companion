import type { ReactNode } from 'react';
import type { 
  Category, 
  SectionDetail, 
  ExternalLink,
  ScriptureSource,
  ExternalLinkType,
  LegacyScripture
} from './database';

/**
 * Tab Bar Component Types
 */

export interface TabItem {
  id: string;
  label: string;
  icon: string;
  iconType?: 'feather' | 'custom';
  iconUrl?: string | null;
  slug: string;
}

export interface TabBarProps {
  tabs: TabItem[];
  activeTab: string | null;
  onTabChange: (tabId: string | null) => void;
}

/**
 * Accordion Component Types
 */

export interface AccordionItem {
  id: number;
  title: string | ReactNode; // Allow both string and React elements
  content: ReactNode;
  summary?: string;
  onExpand?: () => void;
  categorySlug?: string;
  sectionTitle?: string; // Raw title string for bookmarks (when title is ReactNode)
}

export interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
  defaultExpanded?: number[];
  /**
   * Visual density variant.
   * - default: standard spacing
   * - compact: tighter spacing + slightly smaller typography
   */
  variant?: 'default' | 'compact';
}

export interface AccordionItemProps {
  id: number;
  title: string | ReactNode; // Allow both string and React elements
  content: ReactNode;
  summary?: string;
  isExpanded: boolean;
  onToggle: (id: number) => void;
  onExpand?: () => void;
  categorySlug?: string;
  sectionTitle?: string; // Raw title string for bookmarks (when title is ReactNode)
}

/**
 * Content Display Types
 */

export interface ContentRendererProps {
  content: string;
  scriptures: LegacyScripture[];
  externalLinks: ExternalLink[];
}

export interface ScriptureCalloutProps {
  scripture: LegacyScripture;
  isOnline: boolean;
}

export interface ScriptureInlineProps {
  scripture: LegacyScripture;
  isOnline: boolean;
}

export interface ExternalLinkListProps {
  links: ExternalLink[];
  isOnline: boolean;
}

export interface ExternalLinkItemProps {
  link: ExternalLink;
  isOnline: boolean;
}

/**
 * Layout Component Types
 */

export interface ContainerProps {
  children: ReactNode;
  className?: string;
}

export interface CategoryViewProps {
  category: Category;
}

export interface SectionViewProps {
  section: SectionDetail;
}

/**
 * Icon Component Types
 */

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  className?: string;
  'aria-label'?: string;
  filled?: boolean; // For filled vs. stroke variants
}

/**
 * Loading & Error State Types
 */

export interface LoadingStateProps {
  message?: string;
}

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
}

/**
 * Scripture Source Icon Mapping (Feather Icons)
 */

export const scriptureSourceIcons: Record<ScriptureSource, string> = {
  bible: 'book',
  quran: 'moon',
  hadith: 'file-text',
  tafsir: 'book-open',
  other: 'message-square'
};

/**
 * External Link Icon Mapping (Feather Icons)
 */

export const externalLinkIcons: Record<ExternalLinkType, string> = {
  video: 'video',
  article: 'file-text',
  resource: 'link'
};

/**
 * Tab Icon Mapping (Feather Icons)
 */

export const tabIcons: Record<string, string> = {
  'quick-ref': 'zap',
  'apologetics': 'book',
  'islam': 'moon',
  'engagement': 'message-circle',
  'resources': 'link'
};
