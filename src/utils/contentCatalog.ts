import {
  collection,
  doc,
  FieldValue,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import { firestore } from '@config/firebase';
import { getCategories, getModules } from '@utils/database';
import {
  getCurrentVersionKey,
  getDraftVersion,
  getDraftVersionKey,
  parseSemanticVersion,
} from '@utils/versionManagement';
import { slugify, ensureUniqueSlug } from '@utils/slug';
import type { Category, Module, QueryResult } from '@/types/database';

export type CatalogStatus = 'active' | 'published' | 'archived';
export type CatalogSource = 'sqlite' | 'custom';
export type CatalogIconType = 'feather' | 'custom';

export interface ContentCategoryDoc {
  versionId: string;
  versionKey?: string;
  status: CatalogStatus;
  source: CatalogSource;
  id?: number;
  slug: string;
  displayOrder?: number;
  isHidden?: boolean;
  isDeleted?: boolean;
  name?: string;
  description?: string | null;
  iconType?: CatalogIconType;
  icon?: string | null; // feather
  iconId?: string | null; // custom icon library
  iconUrl?: string | null; // cached url for rendering
  updatedAt?: string | Timestamp | FieldValue;
  updatedBy?: string;
  updatedByName?: string;
}

export interface ContentModuleDoc {
  versionId: string;
  versionKey?: string;
  status: CatalogStatus;
  source: CatalogSource;
  id?: number;
  slug: string;
  categorySlug?: string;
  displayOrder?: number;
  isHidden?: boolean;
  isDeleted?: boolean;
  title?: string;
  subtitle?: string | null;
  description?: string | null;
  iconType?: CatalogIconType;
  icon?: string | null;
  iconId?: string | null;
  iconUrl?: string | null;
  updatedAt?: string | Timestamp | FieldValue;
  updatedBy?: string;
  updatedByName?: string;
}

export interface EffectiveCategory extends Category {
  iconType?: CatalogIconType;
  iconUrl?: string | null;
  isHidden?: boolean;
  isDeleted?: boolean;

  /**
   * True if the current published version marks this item as deleted.
   * If true, the item can only be "restored" by reverting to an older version.
   */
  isDeletedPublished?: boolean;

  source?: CatalogSource;
}

export interface EffectiveModule extends Module {
  iconType?: CatalogIconType;
  iconUrl?: string | null;
  isHidden?: boolean;
  isDeleted?: boolean;

  /**
   * True if the current published version marks this item as deleted.
   * If true, the item can only be "restored" by reverting to an older version.
   */
  isDeletedPublished?: boolean;

  source?: CatalogSource;
  categorySlug?: string;
}

function categoryDocId(slug: string, versionKey: string): string {
  return `${slug}-${versionKey}`;
}

function moduleDocId(slug: string, versionKey: string): string {
  return `${slug}-${versionKey}`;
}

async function fetchCategoryDocs(versionKeyOrId: string, statuses: CatalogStatus[]): Promise<QueryResult<ContentCategoryDoc[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const ref = collection(firestore, 'contentCategories');
    const versionField = parseSemanticVersion(versionKeyOrId) ? 'versionId' : 'versionKey';
    const q = query(ref, where(versionField, '==', versionKeyOrId), where('status', 'in', statuses));
    const snap = await getDocs(q);

    const docs: ContentCategoryDoc[] = [];
    snap.forEach((d) => docs.push(d.data() as ContentCategoryDoc));

    return { success: true, data: docs };
  } catch (error) {
    console.error('Error fetching contentCategories:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch content categories',
    };
  }
}

async function fetchModuleDocs(versionKeyOrId: string, statuses: CatalogStatus[]): Promise<QueryResult<ContentModuleDoc[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const ref = collection(firestore, 'contentModules');
    const versionField = parseSemanticVersion(versionKeyOrId) ? 'versionId' : 'versionKey';
    const q = query(ref, where(versionField, '==', versionKeyOrId), where('status', 'in', statuses));
    const snap = await getDocs(q);

    const docs: ContentModuleDoc[] = [];
    snap.forEach((d) => docs.push(d.data() as ContentModuleDoc));

    return { success: true, data: docs };
  } catch (error) {
    console.error('Error fetching contentModules:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch content modules',
    };
  }
}

function applyCategoryDoc(base: Category, doc: ContentCategoryDoc): EffectiveCategory {
  return {
    ...base,
    name: doc.name ?? base.name,
    description: doc.description ?? base.description,
    icon: (doc.iconType === 'custom' ? null : doc.icon) ?? base.icon,
    iconType: doc.iconType,
    iconUrl: doc.iconUrl ?? null,
    isHidden: doc.isHidden ?? false,
    isDeleted: doc.isDeleted ?? false,
    source: doc.source ?? 'sqlite',
  };
}

function applyModuleDoc(base: Module, doc: ContentModuleDoc, categorySlug?: string): EffectiveModule {
  return {
    ...base,
    title: doc.title ?? base.title,
    description: doc.description ?? base.description,
    icon: (doc.iconType === 'custom' ? null : doc.icon) ?? base.icon,
    iconType: doc.iconType,
    iconUrl: doc.iconUrl ?? null,
    isHidden: doc.isHidden ?? false,
    isDeleted: doc.isDeleted ?? false,
    source: doc.source ?? 'sqlite',
    categorySlug: doc.categorySlug ?? categorySlug,
  };
}

/**
 * Load categories for rendering.
 * - Always applies currentVersion overlays (published)
 * - Optionally layers draftVersion overlays (active) on top for editors
 */
export async function getEffectiveCategoriesForRender(options: {
  includeDraft?: boolean;
  includeHidden?: boolean;
  includeDeleted?: boolean;
} = {}): Promise<QueryResult<EffectiveCategory[]>> {
  const includeDraft = options.includeDraft ?? false;
  const includeHidden = options.includeHidden ?? false;
  const includeDeleted = options.includeDeleted ?? false;

  const baseRes = await getCategories();
  if (!baseRes.success || !baseRes.data) {
    return baseRes as QueryResult<EffectiveCategory[]>;
  }

  // If Firestore isn't configured, fall back to SQLite.
  // In this mode, hidden/deleted state and custom icons must come from the local SQLite DB.
  if (!firestore) {
    const effective = baseRes.data
      .map((cat) => {
        const isHiddenLocal = cat.isHidden === true;
        const isDeletedLocal = cat.isDeleted === true;

        const iconUrl = cat.iconUrl ?? null;
        const iconType: CatalogIconType = cat.iconType
          ? cat.iconType
          : iconUrl
            ? 'custom'
            : 'feather';

        return {
          ...(cat as EffectiveCategory),
          iconType,
          iconUrl,
          isHidden: isHiddenLocal,
          isDeleted: isDeletedLocal,
          isDeletedPublished: false,
          source: 'sqlite' as const,
        };
      })
      .filter((cat) => {
        if (!cat) return false;
        if (cat.isDeleted && !includeDeleted) return false;
        if (cat.isHidden && !includeHidden) return false;
        return true;
      });

    effective.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return { success: true, data: effective };
  }

  const currentVersionKeyRes = await getCurrentVersionKey();
  const currentVersionKey =
    currentVersionKeyRes.success && currentVersionKeyRes.data ? currentVersionKeyRes.data : '0.1.0';

  const draftVersionKeyRes = includeDraft ? await getDraftVersionKey() : null;
  const draftVersionKey =
    includeDraft && draftVersionKeyRes?.success && draftVersionKeyRes.data ? draftVersionKeyRes.data : null;

  const [currentDocsRes, draftDocsRes] = await Promise.all([
    fetchCategoryDocs(currentVersionKey, ['published']),
    draftVersionKey ? fetchCategoryDocs(draftVersionKey, ['active']) : Promise.resolve({ success: true, data: [] as ContentCategoryDoc[] }),
  ]);

  const currentDocs = currentDocsRes.success && currentDocsRes.data ? currentDocsRes.data : [];
  const draftDocs = draftDocsRes.success && draftDocsRes.data ? draftDocsRes.data : [];

  const currentBySlug = new Map(currentDocs.map((d) => [d.slug, d]));
  const draftBySlug = new Map(draftDocs.map((d) => [d.slug, d]));

  const baseEffective = baseRes.data
    .map((cat) => {
      const currentDoc = currentBySlug.get(cat.slug);
      const draftDoc = draftBySlug.get(cat.slug);

      const afterCurrent = currentDoc
        ? applyCategoryDoc(cat, currentDoc)
        : ({ ...cat, isHidden: false, isDeleted: false, source: 'sqlite' } as EffectiveCategory);
      const afterDraft = draftDoc ? applyCategoryDoc(afterCurrent, draftDoc) : afterCurrent;

      // Published tombstone deletes are permanent until reverting to an older version.
      if (currentDoc?.isDeleted === true) return null;

      const deletedInDraft = draftDoc?.isDeleted === true;
      if (deletedInDraft && !includeDeleted) return null;

      const deleted = deletedInDraft;

      const hidden = (draftDoc?.isHidden ?? currentDoc?.isHidden) === true;
      if (hidden && !includeHidden) return null;

      return {
        ...afterDraft,
        isHidden: hidden,
        isDeleted: deleted,
        isDeletedPublished: false,
      };
    })
    .filter(Boolean) as EffectiveCategory[];

  // Add custom categories from overlays (these don't exist in SQLite)
  const customCurrentBySlug = new Map(currentDocs.filter((d) => d.source === 'custom').map((d) => [d.slug, d]));
  const customDraftBySlug = new Map(draftDocs.filter((d) => d.source === 'custom').map((d) => [d.slug, d]));
  const customSlugs = new Set<string>([...customCurrentBySlug.keys(), ...customDraftBySlug.keys()]);

  const customEffective: EffectiveCategory[] = [];
  for (const slug of customSlugs) {
    const current = customCurrentBySlug.get(slug);
    const draft = customDraftBySlug.get(slug);
    const d = draft ?? current;
    if (!d) continue;

    // Published tombstone deletes are permanent until reverting to an older version.
    if (current?.isDeleted === true) continue;

    const deletedInDraft = draft?.isDeleted === true;
    if (deletedInDraft && !includeDeleted) continue;

    const hidden = (draft?.isHidden ?? current?.isHidden) === true;
    if (hidden && !includeHidden) continue;

    const id = typeof d.id === 'number' ? d.id : -1;
    customEffective.push({
      id,
      name: d.name || d.slug,
      slug: d.slug,
      icon: (d.iconType === 'custom' ? null : d.icon) ?? null,
      display_order: typeof d.displayOrder === 'number' ? d.displayOrder : 999,
      description: d.description ?? null,
      created_at: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(),
      iconType: d.iconType,
      iconUrl: d.iconUrl ?? null,
      isHidden: hidden,
      isDeleted: deletedInDraft,
      isDeletedPublished: false,
      source: 'custom',
    });
  }

  // Merge and de-dupe by slug (prefer baseEffective, which already includes overlays on SQLite items)
  const bySlug = new Map<string, EffectiveCategory>();
  for (const c of [...baseEffective, ...customEffective]) {
    bySlug.set(c.slug, c);
  }

  const effective = Array.from(bySlug.values());
  effective.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  return { success: true, data: effective };
}

/**
 * Load all modules for rendering (e.g., CMS browsing).
 * NOTE: for now, this only supports SQLite-backed modules and overlays that edit their card fields.
 */
export async function getEffectiveModulesForRender(options: {
  includeDraft?: boolean;
  includeHidden?: boolean;
  includeDeleted?: boolean;
} = {}): Promise<QueryResult<EffectiveModule[]>> {
  const includeDraft = options.includeDraft ?? false;
  const includeHidden = options.includeHidden ?? false;
  const includeDeleted = options.includeDeleted ?? false;

  const baseRes = await getModules();
  if (!baseRes.success || !baseRes.data) {
    return baseRes as QueryResult<EffectiveModule[]>;
  }

  // Used for category mapping (including custom categories)
  const categoriesRes = await getEffectiveCategoriesForRender({ includeDraft, includeHidden: true });
  const categories = categoriesRes.success && categoriesRes.data ? categoriesRes.data : [];
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  if (!firestore) {
    const effectiveNoFs = baseRes.data
      .map((m) => {
        const isHiddenLocal = m.isHidden === true;
        const isDeletedLocal = m.isDeleted === true;

        const iconUrl = m.iconUrl ?? null;
        const iconType: CatalogIconType = m.iconType
          ? m.iconType
          : iconUrl
            ? 'custom'
            : 'feather';

        const out: EffectiveModule = {
          ...(m as EffectiveModule),
          categorySlug: categoryById.get(m.category_id)?.slug,
          iconType,
          iconUrl,
          isHidden: isHiddenLocal,
          isDeleted: isDeletedLocal,
          isDeletedPublished: false,
          source: 'sqlite' as const,
        };
        return out;
      })
      .filter((m) => {
        if (m.isDeleted && !includeDeleted) return false;
        if (m.isHidden && !includeHidden) return false;
        return true;
      });

    effectiveNoFs.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return { success: true, data: effectiveNoFs };
  }

  const currentVersionKeyRes = await getCurrentVersionKey();
  const currentVersionKey =
    currentVersionKeyRes.success && currentVersionKeyRes.data ? currentVersionKeyRes.data : '0.1.0';

  const draftVersionKeyRes = includeDraft ? await getDraftVersionKey() : null;
  const draftVersionKey =
    includeDraft && draftVersionKeyRes?.success && draftVersionKeyRes.data ? draftVersionKeyRes.data : null;

  const [currentDocsRes, draftDocsRes] = await Promise.all([
    fetchModuleDocs(currentVersionKey, ['published']),
    draftVersionKey ? fetchModuleDocs(draftVersionKey, ['active']) : Promise.resolve({ success: true, data: [] as ContentModuleDoc[] }),
  ]);

  const currentDocs = currentDocsRes.success && currentDocsRes.data ? currentDocsRes.data : [];
  const draftDocs = draftDocsRes.success && draftDocsRes.data ? draftDocsRes.data : [];

  const currentBySlug = new Map(currentDocs.map((d) => [d.slug, d]));
  const draftBySlug = new Map(draftDocs.map((d) => [d.slug, d]));

  const baseEffective = baseRes.data
    .map((m) => {
      const currentDoc = currentBySlug.get(m.slug);
      const draftDoc = draftBySlug.get(m.slug);
      const catSlug = categoryById.get(m.category_id)?.slug;

      const afterCurrent = currentDoc
        ? applyModuleDoc(m, currentDoc, catSlug)
        : ({
            ...(m as EffectiveModule),
            categorySlug: catSlug,
            isHidden: false,
            isDeleted: false,
            source: 'sqlite' as const,
          } as EffectiveModule);
      const afterDraft = draftDoc ? applyModuleDoc(afterCurrent, draftDoc, catSlug) : afterCurrent;

      // Published tombstone deletes are permanent until reverting to an older version.
      if (currentDoc?.isDeleted === true) return null;

      const deletedInDraft = draftDoc?.isDeleted === true;
      if (deletedInDraft && !includeDeleted) return null;

      const hidden = (draftDoc?.isHidden ?? currentDoc?.isHidden) === true;
      if (hidden && !includeHidden) return null;

      return {
        ...afterDraft,
        isHidden: hidden,
        isDeleted: deletedInDraft,
        isDeletedPublished: false,
      };
    })
    .filter(Boolean) as EffectiveModule[];

  // Add custom modules from overlays
  const customCurrentBySlug = new Map(currentDocs.filter((d) => d.source === 'custom').map((d) => [d.slug, d]));
  const customDraftBySlug = new Map(draftDocs.filter((d) => d.source === 'custom').map((d) => [d.slug, d]));
  const customSlugs = new Set<string>([...customCurrentBySlug.keys(), ...customDraftBySlug.keys()]);

  const customEffective: EffectiveModule[] = [];
  for (const slug of customSlugs) {
    const current = customCurrentBySlug.get(slug);
    const draft = customDraftBySlug.get(slug);
    const d = draft ?? current;
    if (!d) continue;

    // Published tombstone deletes are permanent until reverting to an older version.
    if (current?.isDeleted === true) continue;

    const deletedInDraft = draft?.isDeleted === true;
    if (deletedInDraft && !includeDeleted) continue;

    const hidden = (draft?.isHidden ?? current?.isHidden) === true;
    if (hidden && !includeHidden) continue;

    const category = d.categorySlug ? categoryBySlug.get(d.categorySlug) : undefined;
    const id = typeof d.id === 'number' ? d.id : -1;

    customEffective.push({
      id,
      category_id: category?.id ?? -1,
      title: d.title || d.slug,
      slug: d.slug,
      description: d.description ?? null,
      icon: (d.iconType === 'custom' ? null : d.icon) ?? null,
      display_order: typeof d.displayOrder === 'number' ? d.displayOrder : 999,
      created_at: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(),
      iconType: d.iconType,
      iconUrl: d.iconUrl ?? null,
      isHidden: hidden,
      isDeleted: deletedInDraft,
      isDeletedPublished: false,
      source: 'custom',
      categorySlug: d.categorySlug,
    });
  }

  const bySlug = new Map<string, EffectiveModule>();
  for (const m of [...baseEffective, ...customEffective]) {
    bySlug.set(m.slug, m);
  }

  const effective = Array.from(bySlug.values());
  effective.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  return { success: true, data: effective };
}

/**
 * Load modules for a specific category slug.
 * NOTE: for now, this only supports SQLite-backed modules and overlays that edit their card fields.
 */
export async function getEffectiveModulesForCategorySlug(options: {
  categorySlug: string;
  includeDraft?: boolean;
  includeHidden?: boolean;
}): Promise<QueryResult<EffectiveModule[]>> {
  const includeDraft = options.includeDraft ?? false;
  const includeHidden = options.includeHidden ?? false;

  const categoriesRes = await getEffectiveCategoriesForRender({ includeDraft, includeHidden: true });
  if (!categoriesRes.success || !categoriesRes.data) {
    return { success: false, error: categoriesRes.error || 'Failed to load categories' };
  }

  const category = categoriesRes.data.find((c) => c.slug === options.categorySlug);
  if (!category) {
    return { success: false, error: 'Category not found' };
  }

  const modulesRes = await getEffectiveModulesForRender({ includeDraft, includeHidden });
  if (!modulesRes.success || !modulesRes.data) {
    return { success: false, error: modulesRes.error || 'Failed to load modules' };
  }

  const filtered = modulesRes.data.filter((m) => m.category_id === category.id);
  return { success: true, data: filtered };
}

export async function upsertDraftCategoryOverlay(
  input: {
    categorySlug: string;
    patch: Partial<Pick<ContentCategoryDoc, 'name' | 'description' | 'iconType' | 'icon' | 'iconId' | 'iconUrl' | 'isHidden' | 'isDeleted' | 'displayOrder'>>;
  },
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<void>> {
  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  const [draftRes, draftKeyRes] = await Promise.all([getDraftVersion(), getDraftVersionKey()]);
  if (!draftRes.success || !draftRes.data) {
    return { success: false, error: draftRes.error || 'Failed to get draft version' };
  }
  if (!draftKeyRes.success || !draftKeyRes.data) {
    return { success: false, error: draftKeyRes.error || 'Failed to get draft version key' };
  }

  const draftVersionId = draftRes.data;
  const draftVersionKey = draftKeyRes.data;

  try {
    const docId = categoryDocId(input.categorySlug, draftVersionKey);
    await setDoc(
      doc(firestore, 'contentCategories', docId),
      {
        versionId: draftVersionId,
        versionKey: draftVersionKey,
        status: 'active',
        source: 'sqlite',
        slug: input.categorySlug,
        ...input.patch,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.displayName || user.email || 'Unknown User',
      } satisfies ContentCategoryDoc,
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error upserting draft category overlay:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save category overlay',
    };
  }
}

function createIdFromDocId(docId: string): number {
  // Deterministic 32-bit hash -> negative ID
  let hash = 0;
  for (let i = 0; i < docId.length; i += 1) {
    hash = (hash * 31 + docId.charCodeAt(i)) | 0;
  }
  const n = Math.abs(hash || 1);
  return -n;
}

function customCategoryDocId(slug: string, versionKey: string): string {
  return `custom-category-${slug}-${versionKey}`;
}

function customModuleDocId(slug: string, versionKey: string): string {
  return `custom-module-${slug}-${versionKey}`;
}

export async function createDraftCustomCategory(
  input: {
    name: string;
    description?: string | null;
    iconType?: CatalogIconType;
    icon?: string | null;
    iconId?: string | null;
    iconUrl?: string | null;
  },
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<EffectiveCategory>> {
  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  const [draftRes, draftKeyRes] = await Promise.all([getDraftVersion(), getDraftVersionKey()]);
  if (!draftRes.success || !draftRes.data) {
    return { success: false, error: draftRes.error || 'Failed to get draft version' };
  }
  if (!draftKeyRes.success || !draftKeyRes.data) {
    return { success: false, error: draftKeyRes.error || 'Failed to get draft version key' };
  }
  const draftVersionId = draftRes.data;
  const draftVersionKey = draftKeyRes.data;

  const current = await getEffectiveCategoriesForRender({ includeDraft: true, includeHidden: true, includeDeleted: true });
  const existing = current.success && current.data ? current.data : [];
  const taken = new Set(existing.map((c) => c.slug));

  const base = slugify(input.name);
  const slug = ensureUniqueSlug(base, taken);
  if (!slug) return { success: false, error: 'Please enter a valid name' };

  const maxOrder = existing.reduce((acc, c) => Math.max(acc, c.display_order ?? 0), 0);
  const displayOrder = maxOrder + 1;

  const docId = customCategoryDocId(slug, draftVersionKey);
  const id = createIdFromDocId(docId);

  try {
    await setDoc(
      doc(firestore, 'contentCategories', docId),
      {
        versionId: draftVersionId,
        versionKey: draftVersionKey,
        status: 'active',
        source: 'custom',
        id,
        slug,
        name: input.name.trim(),
        description: input.description ?? null,
        displayOrder,
        iconType: input.iconType ?? 'feather',
        icon: input.icon ?? 'book',
        iconId: input.iconId ?? null,
        iconUrl: input.iconUrl ?? null,
        isHidden: false,
        isDeleted: false,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.displayName || user.email || 'Unknown User',
      } satisfies ContentCategoryDoc,
      { merge: true }
    );

    return {
      success: true,
      data: {
        id,
        name: input.name.trim(),
        slug,
        icon: input.iconType === 'custom' ? null : (input.icon ?? 'book'),
        display_order: displayOrder,
        description: input.description ?? null,
        created_at: new Date().toISOString(),
        iconType: input.iconType ?? 'feather',
        iconUrl: input.iconUrl ?? null,
        isHidden: false,
        isDeleted: false,
        source: 'custom',
      },
    };
  } catch (error) {
    console.error('Error creating custom category:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create category' };
  }
}

export async function createDraftCustomModule(
  input: {
    categorySlug: string;
    title: string;
    description?: string | null;
    iconType?: CatalogIconType;
    icon?: string | null;
    iconId?: string | null;
    iconUrl?: string | null;
  },
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<EffectiveModule>> {
  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  const [draftRes, draftKeyRes] = await Promise.all([getDraftVersion(), getDraftVersionKey()]);
  if (!draftRes.success || !draftRes.data) {
    return { success: false, error: draftRes.error || 'Failed to get draft version' };
  }
  if (!draftKeyRes.success || !draftKeyRes.data) {
    return { success: false, error: draftKeyRes.error || 'Failed to get draft version key' };
  }
  const draftVersionId = draftRes.data;
  const draftVersionKey = draftKeyRes.data;

  const categoriesRes = await getEffectiveCategoriesForRender({ includeDraft: true, includeHidden: true });
  const categories = categoriesRes.success && categoriesRes.data ? categoriesRes.data : [];
  const category = categories.find((c) => c.slug === input.categorySlug);
  if (!category) return { success: false, error: 'Category not found' };

  const modulesRes = await getEffectiveModulesForRender({ includeDraft: true, includeHidden: true, includeDeleted: true });
  const existing = modulesRes.success && modulesRes.data ? modulesRes.data : [];
  const taken = new Set(existing.map((m) => m.slug));

  const base = slugify(input.title);
  const slug = ensureUniqueSlug(base, taken);
  if (!slug) return { success: false, error: 'Please enter a valid title' };

  const maxOrder = existing
    .filter((m) => m.category_id === category.id)
    .reduce((acc, m) => Math.max(acc, m.display_order ?? 0), 0);
  const displayOrder = maxOrder + 1;

  const docId = customModuleDocId(slug, draftVersionKey);
  const id = createIdFromDocId(docId);

  try {
    await setDoc(
      doc(firestore, 'contentModules', docId),
      {
        versionId: draftVersionId,
        versionKey: draftVersionKey,
        status: 'active',
        source: 'custom',
        id,
        slug,
        categorySlug: category.slug,
        title: input.title.trim(),
        description: input.description ?? null,
        displayOrder,
        iconType: input.iconType ?? 'feather',
        icon: input.icon ?? 'book',
        iconId: input.iconId ?? null,
        iconUrl: input.iconUrl ?? null,
        isHidden: false,
        isDeleted: false,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.displayName || user.email || 'Unknown User',
      } satisfies ContentModuleDoc,
      { merge: true }
    );

    return {
      success: true,
      data: {
        id,
        category_id: category.id,
        title: input.title.trim(),
        slug,
        description: input.description ?? null,
        icon: input.iconType === 'custom' ? null : (input.icon ?? 'book'),
        display_order: displayOrder,
        created_at: new Date().toISOString(),
        iconType: input.iconType ?? 'feather',
        iconUrl: input.iconUrl ?? null,
        isHidden: false,
        isDeleted: false,
        source: 'custom',
        categorySlug: category.slug,
      },
    };
  } catch (error) {
    console.error('Error creating custom module:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create module' };
  }
}

export async function upsertDraftModuleOverlay(
  input: {
    moduleSlug: string;
    patch: Partial<Pick<ContentModuleDoc, 'title' | 'description' | 'iconType' | 'icon' | 'iconId' | 'iconUrl' | 'isHidden' | 'isDeleted' | 'displayOrder' | 'categorySlug'>>;
  },
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<void>> {
  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  const [draftRes, draftKeyRes] = await Promise.all([getDraftVersion(), getDraftVersionKey()]);
  if (!draftRes.success || !draftRes.data) {
    return { success: false, error: draftRes.error || 'Failed to get draft version' };
  }
  if (!draftKeyRes.success || !draftKeyRes.data) {
    return { success: false, error: draftKeyRes.error || 'Failed to get draft version key' };
  }

  const draftVersionId = draftRes.data;
  const draftVersionKey = draftKeyRes.data;

  try {
    const docId = moduleDocId(input.moduleSlug, draftVersionKey);
    await setDoc(
      doc(firestore, 'contentModules', docId),
      {
        versionId: draftVersionId,
        versionKey: draftVersionKey,
        status: 'active',
        source: 'sqlite',
        slug: input.moduleSlug,
        ...input.patch,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.displayName || user.email || 'Unknown User',
      } satisfies ContentModuleDoc,
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error upserting draft module overlay:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save module overlay',
    };
  }
}

async function upsertDraftCustomCategoryPatch(
  input: {
    categorySlug: string;
    patch: Partial<Pick<ContentCategoryDoc, 'isHidden' | 'isDeleted'>>;
  },
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<void>> {
  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  const [draftRes, draftKeyRes, currentKeyRes] = await Promise.all([
    getDraftVersion(),
    getDraftVersionKey(),
    getCurrentVersionKey(),
  ]);
  if (!draftRes.success || !draftRes.data) {
    return { success: false, error: draftRes.error || 'Failed to get draft version' };
  }
  if (!draftKeyRes.success || !draftKeyRes.data) {
    return { success: false, error: draftKeyRes.error || 'Failed to get draft version key' };
  }
  if (!currentKeyRes.success || !currentKeyRes.data) {
    return { success: false, error: currentKeyRes.error || 'Failed to get current version key' };
  }

  const draftVersionId = draftRes.data;
  const draftVersionKey = draftKeyRes.data;
  const currentVersionKey = currentKeyRes.data;

  const draftId = customCategoryDocId(input.categorySlug, draftVersionKey);
  const currentId = customCategoryDocId(input.categorySlug, currentVersionKey);

  const [draftSnap, currentSnap] = await Promise.all([
    getDoc(doc(firestore, 'contentCategories', draftId)),
    getDoc(doc(firestore, 'contentCategories', currentId)),
  ]);

  const base = (draftSnap.exists() ? (draftSnap.data() as ContentCategoryDoc) : null) ||
    (currentSnap.exists() ? (currentSnap.data() as ContentCategoryDoc) : null);

  if (!base) {
    return { success: false, error: 'Category not found' };
  }

  try {
    await setDoc(
      doc(firestore, 'contentCategories', draftId),
      {
        ...base,
        versionId: draftVersionId,
        versionKey: draftVersionKey,
        status: 'active',
        source: 'custom',
        slug: input.categorySlug,
        ...input.patch,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.displayName || user.email || 'Unknown User',
      } satisfies ContentCategoryDoc,
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error upserting custom category:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update category' };
  }
}

async function upsertDraftCustomModulePatch(
  input: {
    moduleSlug: string;
    patch: Partial<Pick<ContentModuleDoc, 'isHidden' | 'isDeleted'>>;
  },
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<void>> {
  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  const [draftRes, draftKeyRes, currentKeyRes] = await Promise.all([
    getDraftVersion(),
    getDraftVersionKey(),
    getCurrentVersionKey(),
  ]);
  if (!draftRes.success || !draftRes.data) {
    return { success: false, error: draftRes.error || 'Failed to get draft version' };
  }
  if (!draftKeyRes.success || !draftKeyRes.data) {
    return { success: false, error: draftKeyRes.error || 'Failed to get draft version key' };
  }
  if (!currentKeyRes.success || !currentKeyRes.data) {
    return { success: false, error: currentKeyRes.error || 'Failed to get current version key' };
  }

  const draftVersionId = draftRes.data;
  const draftVersionKey = draftKeyRes.data;
  const currentVersionKey = currentKeyRes.data;

  const draftId = customModuleDocId(input.moduleSlug, draftVersionKey);
  const currentId = customModuleDocId(input.moduleSlug, currentVersionKey);

  const [draftSnap, currentSnap] = await Promise.all([
    getDoc(doc(firestore, 'contentModules', draftId)),
    getDoc(doc(firestore, 'contentModules', currentId)),
  ]);

  const base = (draftSnap.exists() ? (draftSnap.data() as ContentModuleDoc) : null) ||
    (currentSnap.exists() ? (currentSnap.data() as ContentModuleDoc) : null);

  if (!base) {
    return { success: false, error: 'Module not found' };
  }

  try {
    await setDoc(
      doc(firestore, 'contentModules', draftId),
      {
        ...base,
        versionId: draftVersionId,
        versionKey: draftVersionKey,
        status: 'active',
        source: 'custom',
        slug: input.moduleSlug,
        ...input.patch,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.displayName || user.email || 'Unknown User',
      } satisfies ContentModuleDoc,
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error upserting custom module:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update module' };
  }
}

export async function setDraftCategoryHidden(
  input: {
    categorySlug: string;
    source: CatalogSource;
    isHidden: boolean;
  },
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<void>> {
  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  try {
    if (input.source === 'custom') {
      return upsertDraftCustomCategoryPatch(
        { categorySlug: input.categorySlug, patch: { isHidden: input.isHidden } },
        user
      );
    }

    return upsertDraftCategoryOverlay({ categorySlug: input.categorySlug, patch: { isHidden: input.isHidden } }, user);
  } catch (error) {
    console.error('Error setting category hidden:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update category' };
  }
}

export async function setDraftCategoryDeleted(
  input: {
    categorySlug: string;
    source: CatalogSource;
    isDeleted: boolean;
  },
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<void>> {
  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  try {
    // Once a delete has been published (currentVersion), it cannot be restored via draft.
    // Restoring requires reverting to an older version in Version Manifest.
    if (input.isDeleted === false) {
      const currentKeyRes = await getCurrentVersionKey();
      const currentVersionKey =
        currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

      const currentId =
        input.source === 'custom'
          ? customCategoryDocId(input.categorySlug, currentVersionKey)
          : categoryDocId(input.categorySlug, currentVersionKey);

      const currentSnap = await getDoc(doc(firestore, 'contentCategories', currentId));
      if (currentSnap.exists() && (currentSnap.data() as ContentCategoryDoc).isDeleted === true) {
        return {
          success: false,
          error:
            'This category was deleted in a published version. To restore it, revert to an older version in Version Manifest.',
        };
      }
    }

    if (input.source === 'custom') {
      return upsertDraftCustomCategoryPatch(
        { categorySlug: input.categorySlug, patch: { isDeleted: input.isDeleted } },
        user
      );
    }

    return upsertDraftCategoryOverlay({ categorySlug: input.categorySlug, patch: { isDeleted: input.isDeleted } }, user);
  } catch (error) {
    console.error('Error setting category deleted:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update category' };
  }
}

export async function setDraftModuleHidden(
  input: {
    moduleSlug: string;
    source: CatalogSource;
    isHidden: boolean;
  },
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<void>> {
  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  try {
    if (input.source === 'custom') {
      return upsertDraftCustomModulePatch(
        { moduleSlug: input.moduleSlug, patch: { isHidden: input.isHidden } },
        user
      );
    }

    return upsertDraftModuleOverlay({ moduleSlug: input.moduleSlug, patch: { isHidden: input.isHidden } }, user);
  } catch (error) {
    console.error('Error setting module hidden:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update module' };
  }
}

export async function setDraftModuleDeleted(
  input: {
    moduleSlug: string;
    source: CatalogSource;
    isDeleted: boolean;
  },
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<void>> {
  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  try {
    // Once a delete has been published (currentVersion), it cannot be restored via draft.
    // Restoring requires reverting to an older version in Version Manifest.
    if (input.isDeleted === false) {
      const currentKeyRes = await getCurrentVersionKey();
      const currentVersionKey =
        currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

      const currentId =
        input.source === 'custom'
          ? customModuleDocId(input.moduleSlug, currentVersionKey)
          : moduleDocId(input.moduleSlug, currentVersionKey);

      const currentSnap = await getDoc(doc(firestore, 'contentModules', currentId));
      if (currentSnap.exists() && (currentSnap.data() as ContentModuleDoc).isDeleted === true) {
        return {
          success: false,
          error:
            'This module was deleted in a published version. To restore it, revert to an older version in Version Manifest.',
        };
      }
    }

    if (input.source === 'custom') {
      return upsertDraftCustomModulePatch(
        { moduleSlug: input.moduleSlug, patch: { isDeleted: input.isDeleted } },
        user
      );
    }

    return upsertDraftModuleOverlay({ moduleSlug: input.moduleSlug, patch: { isDeleted: input.isDeleted } }, user);
  } catch (error) {
    console.error('Error setting module deleted:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update module' };
  }
}
