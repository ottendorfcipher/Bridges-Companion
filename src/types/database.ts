/**
 * Database model type definitions
 * Maps to SQLite schema defined in src/data/schema-v2.sql
 */

// New V2 schema types
export interface Category {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  display_order: number;
  description: string | null;
  created_at: string;

  // Optional fields used by the offline build + Firestore overlays.
  iconType?: 'feather' | 'custom';
  iconUrl?: string | null;
  isHidden?: boolean;
  isDeleted?: boolean;
}

export interface Module {
  id: number;
  category_id: number;
  title: string;
  slug: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  created_at: string;

  // Optional fields used by the offline build + Firestore overlays.
  iconType?: 'feather' | 'custom';
  iconUrl?: string | null;
  isHidden?: boolean;
  isDeleted?: boolean;
}

export interface Page {
  id: number;
  module_id: number;
  slug: string;
  page_number: number;
  title: string;
  page_type: string | null; // A, B, C, etc.
  sensitivity: string | null; // Low, Medium, High
  depth: string | null; // Overview, Intermediate, Deep
  purpose: string | null;
  content: string;
  display_order: number;
  created_at: string;

  // Optional fields used by the offline build + Firestore overlays.
  isHidden?: boolean;
  isDeleted?: boolean;
}

// Legacy Section type for backward compatibility
export interface Section extends Omit<Page, 'page_number' | 'page_type' | 'sensitivity' | 'depth' | 'purpose'> {
  category_id: number;
  sort_order: number;
  summary: string | null;
}

// Deprecated - not used in V2 schema
export interface Subsection {
  id: number;
  section_id: number;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
}

export type ScriptureSource = 'quran' | 'bible' | 'hadith' | 'tafsir' | 'other';
export type ScriptureEmphasis = 'inline' | 'callout';

// V2 Schema - scripture with source_data JSON
export interface Scripture {
  id: string; // Changed to string (e.g., "quran-5-46")
  type: ScriptureSource;
  label: string; // Display label (e.g., "Qur'an 5:46")
  source_data: string; // JSON string with source-specific fields
  emphasis: ScriptureEmphasis;
  created_at: string;
}

// Legacy V1 Schema - scripture with direct properties (for backward compatibility)
export interface LegacyScripture {
  id: number;
  section_id?: number;
  page_id?: number;
  source: ScriptureSource;
  reference: string;
  text: string;
  emphasis: ScriptureEmphasis;
  url?: string;
  sort_order?: number;
  created_at?: string;
}

// Parsed scripture source data
export interface ScriptureSourceData {
  // Bible
  book?: string;
  reference?: string;
  translation?: string;
  text?: string;
  // Quran
  surah?: number;
  ayah?: number;
  // Hadith
  collection?: string;
  number?: string;
  // Tafsir
  scholar?: string;
}

export type ExternalLinkType = 'video' | 'article' | 'resource';

export interface ExternalLink {
  id: number;
  page_id: number;
  title: string;
  url: string;
  link_type: ExternalLinkType;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface Metadata {
  key: string;
  value: string;
  updated_at: string;
}

/**
 * Enriched types for UI consumption
 */

export interface ModuleWithPages extends Module {
  pages: PageSummary[];
}

export interface PageSummary {
  id: number;
  slug: string;
  page_number: number;
  title: string;
  page_type: string | null;
  sensitivity: string | null;
  display_order: number;

  // Optional fields used by the offline build + Firestore overlays.
  isHidden?: boolean;
  isDeleted?: boolean;
}

export interface PageDetail extends Page {
  scriptures: LegacyScripture[]; // Using legacy format for backward compatibility
  external_links: ExternalLink[];
}

// Legacy aliases
export interface CategoryWithSections extends ModuleWithPages {}
export interface SectionSummary extends PageSummary {
  summary: string | null;
  sort_order: number;
}
export interface SectionDetail extends PageDetail {
  subsections?: Subsection[];
}

/**
 * Database query result types
 */

export interface QueryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DatabaseStats {
  modules: number;
  pages: number;
  scriptures: number;
  external_links: number;
  // Legacy aliases
  categories: number;
  sections: number;
}
