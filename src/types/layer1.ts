/**
 * Layer 1 Architecture Types
 * Based on docs/docs 2/ specifications
 */

// ============================================
// PAGE TYPES (from 03-page-templates.md)
// ============================================
export type PageType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface PageTypeInfo {
  type: PageType;
  name: string;
  description: string;
  maxWords: number;
}

export const PAGE_TYPE_INFO: Record<PageType, PageTypeInfo> = {
  A: { type: 'A', name: 'Overview', description: 'Module overview with suggested paths', maxWords: 500 },
  B: { type: 'B', name: 'Concept', description: 'Core concept explanation', maxWords: 700 },
  C: { type: 'C', name: 'Comparison', description: 'Side-by-side tradition comparison', maxWords: 800 },
  D: { type: 'D', name: 'Conversation Guide', description: 'Step-by-step conversation framework', maxWords: 600 },
  E: { type: 'E', name: 'Language Phrase', description: 'Arabic phrases with context', maxWords: 300 },
  F: { type: 'F', name: 'Quick Reference', description: 'Brief definition or lookup', maxWords: 200 },
};

// ============================================
// TAG SYSTEM (from 02-tags-and-search.md)
// ============================================
export type TagCategory = 'topic' | 'tradition' | 'skill';

export type TopicTag = 
  | 'scripture'
  | 'interpretation'
  | 'authority'
  | 'history'
  | 'theology'
  | 'jesus'
  | 'god'
  | 'revelation'
  | 'language'
  | 'culture'
  | 'conversation'
  | 'testimony'
  | 'text-transmission'
  | 'manuscripts'
  | 'preservation';

export type TraditionTag = 'islam' | 'christianity' | 'both';

export type SkillTag =
  | 'understanding'
  | 'comparison'
  | 'discussion'
  | 'listening'
  | 'explanation'
  | 'reflection'
  | 'language-use'
  | 'cultural-awareness';

export type SensitivityLevel = 'low' | 'medium' | 'high';

export type DepthLevel = 'intro' | 'overview' | 'detailed' | 'reference';

export interface Tag {
  id: number;
  name: string;
  category: TagCategory;
  description?: string;
  created_at: string;
}

export interface PageTags {
  topic: TopicTag[];
  tradition: TraditionTag[];
  skill: SkillTag[];
  sensitivity: SensitivityLevel;
  depth: DepthLevel;
}

// ============================================
// NAVIGATION STRUCTURE (from 00-architecture.md)
// ============================================
export type PrimarySection = 'learn' | 'compare' | 'practice' | 'language' | 'reference';

export interface Category {
  id: number;
  name: string;
  slug: PrimarySection;
  icon: string;
  sort_order: number;
  description: string | null;
  created_at: string;
}

export interface Module {
  id: number;
  category_id: number;
  title: string;
  slug: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface ModuleWithPages extends Module {
  pages: PageSummary[];
}

export interface CategoryWithModules extends Category {
  modules: ModuleWithPages[];
}

// ============================================
// PAGE STRUCTURES
// ============================================
export interface Page {
  id: number;
  module_id: number;
  title: string;
  slug: string;
  page_type: PageType;
  sensitivity_level: SensitivityLevel;
  depth_level: DepthLevel;
  sort_order: number;
  content: string;
  summary: string | null;
  word_count: number | null;
  created_at: string;
}

export interface PageSummary {
  id: number;
  title: string;
  slug: string;
  page_type: PageType;
  sensitivity_level: SensitivityLevel;
  sort_order: number;
  summary: string | null;
}

export interface PageDetail extends Page {
  tags: PageTags;
  sections: Section[];
  scriptures: Scripture[];
  external_links: ExternalLink[];
  related_pages: RelatedPage[];
  reading_paths?: ReadingPath[];
  // Type-specific content
  conversation_steps?: ConversationStep[];
  language_phrases?: LanguagePhrase[];
  comparison_content?: ComparisonContent[];
}

// ============================================
// CONTENT SECTIONS
// ============================================
export interface Section {
  id: number;
  page_id: number;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
}

export interface Scripture {
  id: number;
  page_id: number;
  reference: string;
  text: string | null;
  source: 'quran' | 'bible' | 'hadith' | 'other';
  url: string | null;
  emphasis: 'inline' | 'callout';
  created_at: string;
}

export interface ExternalLink {
  id: number;
  page_id: number;
  title: string;
  url: string;
  type: 'video' | 'article' | 'website';
  description: string | null;
  created_at: string;
}

// ============================================
// READING PATHS (from 00-architecture.md)
// ============================================
export type ReadingPathType = 'foundations' | 'deeper' | 'practice';

export interface ReadingPath {
  id: number;
  page_id: number;
  path_type: ReadingPathType;
  target_page_id: number;
  target_page_title?: string;
  target_page_slug?: string;
  sort_order: number;
}

export interface RelatedPage {
  page_id: number;
  related_page_id: number;
  title: string;
  slug: string;
  page_type: PageType;
  sensitivity_level: SensitivityLevel;
  sort_order: number;
}

// ============================================
// TYPE D: CONVERSATION GUIDE
// ============================================
export type ConversationStepType = 
  | 'what_you_hear' 
  | 'what_they_mean' 
  | 'how_to_respond' 
  | 'when_to_pause';

export interface ConversationStep {
  id: number;
  page_id: number;
  step_type: ConversationStepType;
  content: string;
  sort_order: number;
  created_at: string;
}

export const CONVERSATION_STEP_LABELS: Record<ConversationStepType, string> = {
  what_you_hear: 'What You May Hear',
  what_they_mean: 'What People Often Mean',
  how_to_respond: 'Ways to Respond Respectfully',
  when_to_pause: 'When to Pause',
};

// ============================================
// TYPE E: LANGUAGE PHRASE
// ============================================
export interface LanguagePhrase {
  id: number;
  page_id: number;
  english: string;
  arabic: string;
  transliteration: string;
  when_to_use: string | null;
  when_not_to_use: string | null;
  cultural_weight: string | null;
  sort_order: number;
  created_at: string;
}

// ============================================
// TYPE C: COMPARISON
// ============================================
export type ComparisonPerspective = 'christian' | 'muslim' | 'overlap' | 'difference';

export interface ComparisonContent {
  id: number;
  page_id: number;
  perspective: ComparisonPerspective;
  content: string;
  sort_order: number;
  created_at: string;
}

// ============================================
// REFERENCE SECTION (from 02-tags-and-search.md)
// ============================================
export interface GlossaryEntry {
  id: number;
  term: string;
  definition: string;
  related_page_id: number | null;
  related_page_title?: string;
  related_page_slug?: string;
  sort_key: string;
  created_at: string;
}

// ============================================
// BREADCRUMB NAVIGATION
// ============================================
export interface Breadcrumb {
  label: string;
  slug?: string;
  type: 'category' | 'module' | 'page';
}

export interface NavigationContext {
  category: Category;
  module: Module;
  page: Page;
  breadcrumbs: Breadcrumb[];
  previousPage?: PageSummary;
  nextPage?: PageSummary;
}

// ============================================
// SEARCH (from 02-tags-and-search.md)
// ============================================
export interface SearchFilters {
  topic?: TopicTag[];
  tradition?: TraditionTag[];
  skill?: SkillTag[];
  depth?: DepthLevel[];
  section?: PrimarySection[];
  module?: string[];
  sensitivity?: SensitivityLevel[];
}

export interface SearchResult extends PageSummary {
  module_title: string;
  category_slug: PrimarySection;
  tags: PageTags;
  relevance_score?: number;
}

// ============================================
// LANGUAGE GUARDRAILS (from 01-language-guardrails.md)
// ============================================
export const PROHIBITED_TERMS = [
  'mission',
  'faith-based learning',
  'faith educator',
  'convert',
  'conversion',
  'evangelize',
  'evangelism',
  'apologetics', // in public-facing content
  'win',
  'lose',
  'target',
  'strategy', // when referring to people
  'refute',
  'destroy',
  'expose',
  'debate',
  'argument',
] as const;

export type ProhibitedTerm = typeof PROHIBITED_TERMS[number];

export interface ContentValidationResult {
  isValid: boolean;
  prohibitedTermsFound: ProhibitedTerm[];
  suggestions?: string[];
}

// ============================================
// UI STATE MANAGEMENT
// ============================================
export interface ScrollPosition {
  pageId: number;
  scrollY: number;
  timestamp: number;
}

export interface AppState {
  activeCategory: PrimarySection | null;
  activeModule: string | null;
  activePage: string | null;
  scrollPositions: Map<string, ScrollPosition>;
}
