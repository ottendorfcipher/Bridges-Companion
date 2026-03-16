import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { firestore } from '@config/firebase';
import { resolveBaseContentSource } from '@utils/baseContentSource';
import type {
  Category,
  CategoryWithSections,
  DatabaseStats,
  ExternalLink,
  Module,
  ModuleWithPages,
  Page,
  PageDetail,
  PageSummary,
  QueryResult,
  Scripture,
  SectionDetail
} from '@/types/database';

function shouldUseFirestoreBase(): boolean {
  return resolveBaseContentSource() === 'firestore' && Boolean(firestore);
}

const BASE_COLLECTIONS = {
  categories: 'sqliteCategories',
  modules: 'sqliteModules',
  pages: 'sqlitePages',
  scriptures: 'sqliteScriptures',
  pageScriptures: 'sqlitePageScriptures',
  externalLinks: 'sqliteExternalLinks',
} as const;

type FsCategoryDoc = {
  legacyId: number;
  slug: string;
  name: string;
  icon?: string | null;
  display_order?: number;
  description?: string | null;
  created_at?: string | null;
};

type FsModuleDoc = {
  legacyId: number;
  categoryLegacyId: number;
  slug: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  display_order?: number;
  created_at?: string | null;
};

type FsPageDoc = {
  legacyId: number;
  moduleLegacyId: number;
  slug: string;
  title: string;
  page_number?: number | null;
  page_type?: string | null;
  sensitivity?: string | null;
  display_order?: number;
  content: string;
  summary?: string | null;
  purpose?: string | null;
  created_at?: string | null;
};

type FsScriptureDoc = {
  legacyId: string;
  reference: string;
  text?: string | null;
  source: string;
  url?: string | null;
  emphasis?: string | null;
};

type FsPageScriptureDoc = {
  pageLegacyId: number;
  scriptureLegacyId: string;
  display_order?: number;
};

type FsExternalLinkDoc = {
  legacyId: number;
  pageLegacyId: number;
  title: string;
  url: string;
  type: string;
  description?: string | null;
  display_order?: number;
  created_at?: string | null;
};

function asIsoString(v: unknown): string {
  if (typeof v === 'string' && v.trim().length > 0) return v;
  return new Date().toISOString();
}

function coerceNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function coerceBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
  }
  return fallback;
}

function mapExternalLinkRow(row: any): ExternalLink {
  // SQLite schema uses `type`; our TS types expect `link_type`.
  const linkType = row?.link_type ?? row?.type ?? 'article';
  return {
    id: coerceNumber(row?.id, 0),
    page_id: coerceNumber(row?.page_id ?? row?.pageLegacyId, 0),
    title: String(row?.title ?? ''),
    url: String(row?.url ?? ''),
    link_type: linkType,
    description: row?.description ?? null,
    display_order: coerceNumber(row?.display_order, 0),
    created_at: asIsoString(row?.created_at),
  } as unknown as ExternalLink;
}

/**
 * Database manager singleton
 * Handles SQLite database initialization and queries
 */
class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private initialized = false;

  private sqliteColumns: {
    categories: Set<string>;
    modules: Set<string>;
    pages: Set<string>;
  } = {
    categories: new Set(),
    modules: new Set(),
    pages: new Set(),
  };

  private fsCache: {
    categories: Category[] | null;
    categoriesById: Map<number, Category>;
    modules: Module[] | null;
    modulesBySlug: Map<string, Module>;
    pagesById: Map<number, Page>;
    pagesByModuleId: Map<number, PageSummary[]>;
    scripturesByLegacyId: Map<string, FsScriptureDoc> | null;
    pageScripturesByPageId: Map<number, FsPageScriptureDoc[]>;
    externalLinksByPageId: Map<number, ExternalLink[]>;
  } = {
    categories: null,
    categoriesById: new Map(),
    modules: null,
    modulesBySlug: new Map(),
    pagesById: new Map(),
    pagesByModuleId: new Map(),
    scripturesByLegacyId: null,
    pageScripturesByPageId: new Map(),
    externalLinksByPageId: new Map(),
  };

  private constructor() {}

  private sqliteHas(table: 'categories' | 'modules' | 'pages', column: string): boolean {
    return this.sqliteColumns[table].has(column);
  }

  private detectSqliteColumns(): void {
    if (!this.db) return;

    const read = (table: 'categories' | 'modules' | 'pages') => {
      try {
        const rows = this.query<any>(`PRAGMA table_info(${table})`);
        this.sqliteColumns[table] = new Set(rows.map((r: any) => String(r.name)));
      } catch {
        this.sqliteColumns[table] = new Set();
      }
    };

    read('categories');
    read('modules');
    read('pages');
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize database
   * - SQLite mode: loads sql.js WASM and database file
   * - Firestore mode: no-op (queries will use Firestore)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (shouldUseFirestoreBase()) {
      this.initialized = true;
      return;
    }

    try {
      // Load sql.js WASM
      this.SQL = await initSqlJs({
        locateFile: (file) => `/sql-wasm/${file}`,
      });

      // Load database file
      const response = await fetch('/content.db');
      if (!response.ok) {
        throw new Error('Failed to load database file');
      }

      const buffer = await response.arrayBuffer();
      this.db = new this.SQL.Database(new Uint8Array(buffer));
      this.detectSqliteColumns();
      this.initialized = true;
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw new Error('Failed to initialize database');
    }
  }

  /**
   * Execute a query and return results (SQLite mode)
   */
  private query<T>(sql: string, params: any[] = []): T[] {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const results: T[] = [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);

    while (stmt.step()) {
      const row = stmt.getAsObject() as T;
      results.push(row);
    }

    stmt.free();
    return results;
  }

  private async fsEnsureCategories(): Promise<Category[]> {
    if (this.fsCache.categories) return this.fsCache.categories;
    if (!firestore) throw new Error('Firestore is not initialized');

    const snap = await getDocs(collection(firestore, BASE_COLLECTIONS.categories));
    const categories: Category[] = snap.docs
      .map((d) => d.data() as FsCategoryDoc)
      .filter((c) => typeof c.legacyId === 'number' && typeof c.slug === 'string')
      .map((c) => ({
        id: c.legacyId,
        name: c.name,
        slug: c.slug,
        icon: c.icon ?? null,
        display_order: coerceNumber(c.display_order, 0),
        description: c.description ?? null,
        created_at: asIsoString(c.created_at),
      }));

    categories.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

    this.fsCache.categories = categories;
    this.fsCache.categoriesById = new Map(categories.map((c) => [c.id, c]));

    return categories;
  }

  private async fsEnsureModules(): Promise<Module[]> {
    if (this.fsCache.modules) return this.fsCache.modules;
    if (!firestore) throw new Error('Firestore is not initialized');

    const categories = await this.fsEnsureCategories();
    const categoryOrder = new Map(categories.map((c) => [c.id, c.display_order ?? 0]));

    const snap = await getDocs(collection(firestore, BASE_COLLECTIONS.modules));
    const modules: Module[] = snap.docs
      .map((d) => d.data() as FsModuleDoc)
      .filter((m) => typeof m.legacyId === 'number' && typeof m.slug === 'string')
      .map((m) => ({
        id: m.legacyId,
        category_id: m.categoryLegacyId,
        title: m.title,
        slug: m.slug,
        description: m.description ?? null,
        icon: m.icon ?? null,
        display_order: coerceNumber(m.display_order, 0),
        created_at: asIsoString(m.created_at),
      }));

    modules.sort((a, b) => {
      const aCat = categoryOrder.get(a.category_id) ?? 0;
      const bCat = categoryOrder.get(b.category_id) ?? 0;
      if (aCat !== bCat) return aCat - bCat;
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });

    this.fsCache.modules = modules;
    this.fsCache.modulesBySlug = new Map(modules.map((m) => [m.slug, m]));

    return modules;
  }

  private async fsGetPagesForModuleId(moduleLegacyId: number): Promise<PageSummary[]> {
    const cached = this.fsCache.pagesByModuleId.get(moduleLegacyId);
    if (cached) return cached;
    if (!firestore) throw new Error('Firestore is not initialized');

    const q = query(
      collection(firestore, BASE_COLLECTIONS.pages),
      where('moduleLegacyId', '==', moduleLegacyId)
    );
    const snap = await getDocs(q);

    const pages: PageSummary[] = snap.docs
      .map((d) => d.data() as FsPageDoc)
      .filter((p) => typeof p.legacyId === 'number')
      .map((p) => ({
        id: p.legacyId,
        slug: p.slug,
        page_number: coerceNumber(p.page_number, 0),
        title: p.title,
        page_type: p.page_type ?? null,
        sensitivity: p.sensitivity ?? null,
        display_order: coerceNumber(p.display_order, 0),
      }));

    pages.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    this.fsCache.pagesByModuleId.set(moduleLegacyId, pages);

    return pages;
  }

  private async fsGetPageById(pageId: number): Promise<Page | null> {
    const cached = this.fsCache.pagesById.get(pageId);
    if (cached) return cached;
    if (!firestore) throw new Error('Firestore is not initialized');

    const q = query(
      collection(firestore, BASE_COLLECTIONS.pages),
      where('legacyId', '==', pageId),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const p = snap.docs[0].data() as FsPageDoc;
    const page: Page = {
      id: p.legacyId,
      module_id: p.moduleLegacyId,
      slug: p.slug,
      page_number: coerceNumber(p.page_number, 0),
      title: p.title,
      page_type: p.page_type ?? null,
      sensitivity: p.sensitivity ?? null,
      depth: null as any,
      purpose: p.purpose ?? null,
      content: p.content,
      display_order: coerceNumber(p.display_order, 0),
      created_at: asIsoString(p.created_at),
    } as unknown as Page;

    this.fsCache.pagesById.set(pageId, page);
    return page;
  }

  private async fsEnsureScriptures(): Promise<Map<string, FsScriptureDoc>> {
    if (this.fsCache.scripturesByLegacyId) return this.fsCache.scripturesByLegacyId;
    if (!firestore) throw new Error('Firestore is not initialized');

    const snap = await getDocs(collection(firestore, BASE_COLLECTIONS.scriptures));
    const m = new Map<string, FsScriptureDoc>();
    snap.docs.forEach((d) => {
      const s = d.data() as FsScriptureDoc;
      if (typeof s.legacyId === 'string') {
        m.set(s.legacyId, s);
      }
    });

    this.fsCache.scripturesByLegacyId = m;
    return m;
  }

  private async fsGetPageScriptures(pageId: number): Promise<FsPageScriptureDoc[]> {
    const cached = this.fsCache.pageScripturesByPageId.get(pageId);
    if (cached) return cached;
    if (!firestore) throw new Error('Firestore is not initialized');

    const q = query(
      collection(firestore, BASE_COLLECTIONS.pageScriptures),
      where('pageLegacyId', '==', pageId)
    );
    const snap = await getDocs(q);

    const rows = snap.docs
      .map((d) => d.data() as FsPageScriptureDoc)
      .filter((r) => typeof r.scriptureLegacyId === 'string');

    rows.sort((a, b) => coerceNumber(a.display_order, 0) - coerceNumber(b.display_order, 0));
    this.fsCache.pageScripturesByPageId.set(pageId, rows);

    return rows;
  }

  private async fsGetExternalLinksForPage(pageId: number): Promise<ExternalLink[]> {
    const cached = this.fsCache.externalLinksByPageId.get(pageId);
    if (cached) return cached;
    if (!firestore) throw new Error('Firestore is not initialized');

    const q = query(
      collection(firestore, BASE_COLLECTIONS.externalLinks),
      where('pageLegacyId', '==', pageId)
    );
    const snap = await getDocs(q);

    const links = snap.docs
      .map((d) => d.data() as FsExternalLinkDoc)
      .map((l) =>
        mapExternalLinkRow({
          id: l.legacyId,
          page_id: l.pageLegacyId,
          title: l.title,
          url: l.url,
          type: l.type,
          description: l.description ?? null,
          display_order: l.display_order ?? 0,
          created_at: l.created_at ?? null,
        })
      );

    links.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    this.fsCache.externalLinksByPageId.set(pageId, links);

    return links;
  }

  /**
   * Get all modules ordered by category and display_order
   */
  async getModules(): Promise<QueryResult<Module[]>> {
    try {
      if (shouldUseFirestoreBase()) {
        const modules = await this.fsEnsureModules();
        return { success: true, data: modules };
      }

      const iconTypeSel = this.sqliteHas('modules', 'icon_type') ? 'm.icon_type as iconType' : 'NULL as iconType';
      const iconUrlSel = this.sqliteHas('modules', 'icon_url') ? 'm.icon_url as iconUrl' : 'NULL as iconUrl';
      const isHiddenSel = this.sqliteHas('modules', 'is_hidden') ? 'm.is_hidden as isHidden' : '0 as isHidden';
      const isDeletedSel = this.sqliteHas('modules', 'is_deleted') ? 'm.is_deleted as isDeleted' : '0 as isDeleted';

      const rows = this.query<any>(
        `SELECT 
          m.id, m.category_id, m.title, m.slug, m.description, m.icon, m.display_order, m.created_at,
          ${iconTypeSel}, ${iconUrlSel}, ${isHiddenSel}, ${isDeletedSel}
         FROM modules m
         JOIN categories c ON m.category_id = c.id
         ORDER BY c.display_order, m.display_order`
      );

      const modules: Module[] = rows.map((r: any) => {
        const iconUrl = r.iconUrl ?? null;
        const iconType = (r.iconType === 'custom' || r.iconType === 'feather')
          ? r.iconType
          : iconUrl
            ? 'custom'
            : 'feather';

        return {
          id: coerceNumber(r.id, 0),
          category_id: coerceNumber(r.category_id, 0),
          title: String(r.title ?? ''),
          slug: String(r.slug ?? ''),
          description: r.description ?? null,
          icon: r.icon ?? null,
          iconType,
          iconUrl,
          display_order: coerceNumber(r.display_order, 0),
          created_at: asIsoString(r.created_at),
          isHidden: coerceBoolean(r.isHidden, false),
          isDeleted: coerceBoolean(r.isDeleted, false),
        };
      });

      return { success: true, data: modules };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all categories (top-level navigation items)
   */
  async getCategories(): Promise<QueryResult<Category[]>> {
    try {
      if (shouldUseFirestoreBase()) {
        const categories = await this.fsEnsureCategories();
        return { success: true, data: categories };
      }

      const iconTypeSel = this.sqliteHas('categories', 'icon_type') ? 'icon_type as iconType' : 'NULL as iconType';
      const iconUrlSel = this.sqliteHas('categories', 'icon_url') ? 'icon_url as iconUrl' : 'NULL as iconUrl';
      const isHiddenSel = this.sqliteHas('categories', 'is_hidden') ? 'is_hidden as isHidden' : '0 as isHidden';
      const isDeletedSel = this.sqliteHas('categories', 'is_deleted') ? 'is_deleted as isDeleted' : '0 as isDeleted';

      const rows = this.query<any>(
        `SELECT 
          id, name, slug, icon, display_order, description, created_at,
          ${iconTypeSel}, ${iconUrlSel}, ${isHiddenSel}, ${isDeletedSel}
         FROM categories 
         ORDER BY display_order`
      );

      const categories: Category[] = rows.map((r: any) => {
        const iconUrl = r.iconUrl ?? null;
        const iconType = (r.iconType === 'custom' || r.iconType === 'feather')
          ? r.iconType
          : iconUrl
            ? 'custom'
            : 'feather';

        return {
          id: coerceNumber(r.id, 0),
          name: String(r.name ?? ''),
          slug: String(r.slug ?? ''),
          icon: r.icon ?? null,
          iconType,
          iconUrl,
          display_order: coerceNumber(r.display_order, 0),
          description: r.description ?? null,
          created_at: asIsoString(r.created_at),
          isHidden: coerceBoolean(r.isHidden, false),
          isDeleted: coerceBoolean(r.isDeleted, false),
        };
      });

      return { success: true, data: categories };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get module with its pages by slug
   */
  async getModuleWithPages(slug: string): Promise<QueryResult<ModuleWithPages>> {
    try {
      if (shouldUseFirestoreBase()) {
        const modules = await this.fsEnsureModules();
        const mod = modules.find((m) => m.slug === slug);
        if (!mod) return { success: false, error: 'Module not found' };

        const pages = await this.fsGetPagesForModuleId(mod.id);
        const cat = this.fsCache.categoriesById.get(mod.category_id);

        const result: ModuleWithPages = {
          ...(mod as any),
          pages,
          category_name: cat?.name,
          category_slug: cat?.slug,
        };

        return { success: true, data: result };
      }

      const modules = this.query<any>(
        `SELECT m.*, c.name as category_name, c.slug as category_slug 
         FROM modules m 
         JOIN categories c ON m.category_id = c.id 
         WHERE m.slug = ?`,
        [slug]
      );

      if (modules.length === 0) {
        return { success: false, error: 'Module not found' };
      }

      const module = modules[0];
      const isHiddenSel = this.sqliteHas('pages', 'is_hidden') ? 'is_hidden as isHidden' : '0 as isHidden';
      const isDeletedSel = this.sqliteHas('pages', 'is_deleted') ? 'is_deleted as isDeleted' : '0 as isDeleted';

      const pagesRaw = this.query<any>(
        `SELECT id, slug, page_number, title, page_type, sensitivity, display_order,
                ${isHiddenSel}, ${isDeletedSel}
         FROM pages WHERE module_id = ? ORDER BY display_order`,
        [module.id]
      );

      const pages: PageSummary[] = pagesRaw.map((p: any) => ({
        id: coerceNumber(p.id, 0),
        slug: String(p.slug ?? ''),
        page_number: coerceNumber(p.page_number, 0),
        title: String(p.title ?? ''),
        page_type: p.page_type ?? null,
        sensitivity: p.sensitivity ?? null,
        display_order: coerceNumber(p.display_order, 0),
        isHidden: coerceBoolean(p.isHidden, false),
        isDeleted: coerceBoolean(p.isDeleted, false),
      }));

      const result: ModuleWithPages = {
        ...module,
        pages,
      };

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Legacy: Get category with sections (alias for getModuleWithPages)
   */
  async getCategoryWithSections(slug: string): Promise<QueryResult<CategoryWithSections>> {
    const result = await this.getModuleWithPages(slug);
    if (!result.success || !result.data) {
      return result as QueryResult<CategoryWithSections>;
    }

    // Map pages to sections format for backward compatibility
    const sections = result.data.pages.map((p) => ({
      id: p.id,
      title: p.title,
      summary: null,
      sort_order: p.display_order,
    }));

    return {
      success: true,
      data: {
        ...result.data,
        sections,
      } as CategoryWithSections,
    };
  }

  /**
   * Get a page id by slug
   */
  async getPageIdBySlug(slug: string): Promise<QueryResult<number>> {
    try {
      const s = String(slug || '').trim();
      if (!s) return { success: false, error: 'Invalid slug' };

      if (shouldUseFirestoreBase()) {
        if (!firestore) throw new Error('Firestore is not initialized');
        const q = query(
          collection(firestore, BASE_COLLECTIONS.pages),
          where('slug', '==', s),
          limit(1)
        );
        const snap = await getDocs(q);
        if (snap.empty) return { success: false, error: 'Page not found' };
        const p = snap.docs[0].data() as FsPageDoc;
        return { success: true, data: p.legacyId };
      }

      const rows = this.query<any>('SELECT id FROM pages WHERE slug = ? LIMIT 1', [s]);
      if (!rows.length) return { success: false, error: 'Page not found' };
      return { success: true, data: coerceNumber(rows[0].id, 0) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get page with full details by ID
   */
  async getPageDetail(pageId: number): Promise<QueryResult<PageDetail>> {
    try {
      if (shouldUseFirestoreBase()) {
        const page = await this.fsGetPageById(pageId);
        if (!page) return { success: false, error: 'Page not found' };

        const pageScriptures = await this.fsGetPageScriptures(pageId);
        const scripturesById = await this.fsEnsureScriptures();

        const legacyScriptures = pageScriptures
          .map((ps) => scripturesById.get(ps.scriptureLegacyId))
          .filter(Boolean)
          .map((s) => ({
            id: (s as FsScriptureDoc).legacyId,
            page_id: pageId,
            source: (s as FsScriptureDoc).source,
            reference: (s as FsScriptureDoc).reference,
            text: (s as FsScriptureDoc).text || '',
            emphasis: (s as FsScriptureDoc).emphasis || 'inline',
            url: (s as FsScriptureDoc).url || null,
          }));

        const externalLinks = await this.fsGetExternalLinksForPage(pageId);

        const result: PageDetail = {
          ...(page as any),
          scriptures: legacyScriptures as any,
          external_links: externalLinks,
        };

        return { success: true, data: result };
      }

      const pages = this.query<Page>('SELECT * FROM pages WHERE id = ?', [pageId]);

      if (pages.length === 0) {
        return { success: false, error: 'Page not found' };
      }

      const page = pages[0];

      // Get scriptures linked to this page
      const scriptures = this.query<any>(
        `SELECT s.* FROM scriptures s
         INNER JOIN page_scriptures ps ON s.id = ps.scripture_id
         WHERE ps.page_id = ?
         ORDER BY ps.display_order`,
        [pageId]
      );

      // Normalize schema differences between historical SQLite schemas.
      const legacyScriptures = scriptures.map((s) => ({
        id: s.id,
        page_id: pageId,
        source: s.source ?? s.type,
        reference: s.reference ?? s.label,
        text: s.text || '',
        emphasis: s.emphasis || 'inline',
        url: s.url || null,
      }));

      // Get external links
      const externalLinksRaw = this.query<any>(
        'SELECT * FROM external_links WHERE page_id = ? ORDER BY display_order',
        [pageId]
      );
      const externalLinks = externalLinksRaw.map(mapExternalLinkRow);

      const result: PageDetail = {
        ...(page as any),
        scriptures: legacyScriptures as any,
        external_links: externalLinks,
      };

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Legacy: Get section detail (alias for getPageDetail)
   */
  async getSectionDetail(sectionId: number): Promise<QueryResult<SectionDetail>> {
    return this.getPageDetail(sectionId) as Promise<QueryResult<SectionDetail>>;
  }

  /**
   * Get scripture by ID (string-based)
   */
  async getScripture(scriptureId: string): Promise<QueryResult<Scripture>> {
    try {
      if (shouldUseFirestoreBase()) {
        const m = await this.fsEnsureScriptures();
        const s = m.get(scriptureId);
        if (!s) return { success: false, error: 'Scripture not found' };

        return {
          success: true,
          data: {
            id: s.legacyId,
            type: s.source as any,
            label: s.reference,
            source_data: '',
            emphasis: (s.emphasis as any) || 'inline',
            created_at: new Date().toISOString(),
          } as any,
        };
      }

      const scriptures = this.query<Scripture>('SELECT * FROM scriptures WHERE id = ?', [scriptureId]);

      if (scriptures.length === 0) {
        return { success: false, error: 'Scripture not found' };
      }

      return { success: true, data: scriptures[0] };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<QueryResult<DatabaseStats>> {
    try {
      if (shouldUseFirestoreBase()) {
        const [categories, modules] = await Promise.all([this.fsEnsureCategories(), this.fsEnsureModules()]);
        const scripts = await this.fsEnsureScriptures();

        // Pages are not necessarily fully cached; estimate by scanning the collection once.
        if (!firestore) throw new Error('Firestore is not initialized');
        const pagesSnap = await getDocs(collection(firestore, BASE_COLLECTIONS.pages));
        const linksSnap = await getDocs(collection(firestore, BASE_COLLECTIONS.externalLinks));

        const stats: DatabaseStats = {
          modules: modules.length,
          pages: pagesSnap.size,
          scriptures: scripts.size,
          external_links: linksSnap.size,
          // Legacy aliases
          categories: categories.length,
          sections: pagesSnap.size,
        };

        return { success: true, data: stats };
      }

      const result = this.query<any>(
        `SELECT 
          (SELECT COUNT(*) FROM categories) as categories,
          (SELECT COUNT(*) FROM modules) as modules,
          (SELECT COUNT(*) FROM pages) as pages,
          (SELECT COUNT(*) FROM scriptures) as scriptures,
          (SELECT COUNT(*) FROM external_links) as external_links`
      )[0];

      const stats: DatabaseStats = {
        modules: result.modules,
        pages: result.pages,
        scriptures: result.scriptures,
        external_links: result.external_links,
        // Legacy aliases
        categories: result.categories,
        sections: result.pages,
      };

      return { success: true, data: stats };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;

    // Clear Firestore caches (safe in either mode)
    this.fsCache.categories = null;
    this.fsCache.categoriesById = new Map();
    this.fsCache.modules = null;
    this.fsCache.modulesBySlug = new Map();
    this.fsCache.pagesById = new Map();
    this.fsCache.pagesByModuleId = new Map();
    this.fsCache.scripturesByLegacyId = null;
    this.fsCache.pageScripturesByPageId = new Map();
    this.fsCache.externalLinksByPageId = new Map();
  }
}

// Export singleton instance
export const db = DatabaseManager.getInstance();

// Export convenience functions
export const initializeDatabase = () => db.initialize();
export const getModules = () => db.getModules();
export const getModuleWithPages = (slug: string) => db.getModuleWithPages(slug);
export const getPageDetail = (pageId: number) => db.getPageDetail(pageId);
export const getScripture = (scriptureId: string) => db.getScripture(scriptureId);
export const getDatabaseStats = () => db.getStats();
export const isDatabaseInitialized = () => db.isInitialized();
export const getPageIdBySlug = (slug: string) => db.getPageIdBySlug(slug);

// Legacy exports (backward compatibility)
export const getCategories = () => db.getCategories();
export const getCategoryWithSections = (slug: string) => db.getCategoryWithSections(slug);
export const getSectionDetail = (sectionId: number) => db.getSectionDetail(sectionId);
