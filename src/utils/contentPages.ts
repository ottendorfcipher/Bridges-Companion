import {
  collection,
  doc,
  FieldValue,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { firestore } from '@config/firebase';
import { getModuleWithPages, getSectionDetail } from '@utils/database';
import {
  getCurrentVersionKey,
  getDraftVersion,
  getDraftVersionKey,
  parseSemanticVersion,
} from '@utils/versionManagement';
import { slugify, ensureUniqueSlug } from '@utils/slug';
import type { PageSummary, QueryResult, SectionDetail } from '@/types/database';

export type PageStatus = 'active' | 'published' | 'archived';
export type PageSource = 'sqlite' | 'custom';

export interface ContentPageDoc {
  versionId: string;
  versionKey?: string;
  status: PageStatus;
  source: PageSource;

  id: number; // SQLite page.id for sqlite source; negative deterministic ID for custom pages
  moduleSlug: string;
  slug: string;

  title?: string;
  purpose?: string | null;
  content?: string;

  pageNumber?: number;
  displayOrder?: number;
  isHidden?: boolean;
  isDeleted?: boolean;

  updatedAt?: string | Timestamp | FieldValue;
  updatedBy?: string;
  updatedByName?: string;
}

export type EffectivePageSummary = PageSummary & {
  source?: PageSource;
  isHidden?: boolean;
  isDeleted?: boolean;

  /**
   * True if the current published version marks this page as deleted.
   * If true, the page can only be "restored" by reverting to an older version.
   */
  isDeletedPublished?: boolean;
};

function createIdFromDocId(docId: string): number {
  let hash = 0;
  for (let i = 0; i < docId.length; i += 1) {
    hash = (hash * 31 + docId.charCodeAt(i)) | 0;
  }
  const n = Math.abs(hash || 1);
  return -n;
}

function sqlitePageDocId(pageId: number, versionKey: string): string {
  return `page-${pageId}-${versionKey}`;
}

function customPageDocId(moduleSlug: string, pageSlug: string, versionKey: string): string {
  return `custom-page-${moduleSlug}-${pageSlug}-${versionKey}`;
}

async function fetchPageDocs(versionKeyOrId: string, statuses: PageStatus[]): Promise<QueryResult<ContentPageDoc[]>> {
  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  try {
    const ref = collection(firestore, 'contentPages');
    const versionField = parseSemanticVersion(versionKeyOrId) ? 'versionId' : 'versionKey';
    const q = query(ref, where(versionField, '==', versionKeyOrId), where('status', 'in', statuses));
    const snap = await getDocs(q);

    const docs: ContentPageDoc[] = [];
    snap.forEach((d) => docs.push(d.data() as ContentPageDoc));

    return { success: true, data: docs };
  } catch (error) {
    console.error('Error fetching contentPages:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch content pages',
    };
  }
}

function normalizeBasePageSummary(p: PageSummary, patch?: ContentPageDoc): EffectivePageSummary {
  return {
    ...p,
    title: patch?.title ?? p.title,
    page_number: patch?.pageNumber ?? p.page_number,
    display_order: patch?.displayOrder ?? p.display_order,
    source: patch?.source ?? 'sqlite',
    isHidden: patch?.isHidden ?? false,
    isDeleted: patch?.isDeleted ?? false,
  };
}

export async function getEffectivePagesForModuleSlug(options: {
  moduleSlug: string;
  includeDraft?: boolean;
  includeHidden?: boolean;
  includeDeleted?: boolean;
}): Promise<QueryResult<EffectivePageSummary[]>> {
  const includeDraft = options.includeDraft ?? false;
  const includeHidden = options.includeHidden ?? false;
  const includeDeleted = options.includeDeleted ?? false;

  // Base pages from SQLite (if the module exists there)
  const baseRes = await getModuleWithPages(options.moduleSlug);
  const basePages = baseRes.success && baseRes.data ? baseRes.data.pages : [];

  // If Firestore isn't available, just return base.
  // In this mode, hidden/deleted state must come from the local SQLite DB.
  if (!firestore) {
    const effectiveNoFs = basePages
      .map((p) => {
        const isLayer2 = String(p.slug || '').startsWith('layer2-') || p.page_type === 'layer2';
        const isHiddenLocal = p.isHidden === true || isLayer2;
        const isDeletedLocal = p.isDeleted === true;
        return {
          ...p,
          source: 'sqlite' as const,
          isHidden: isHiddenLocal,
          isDeleted: isDeletedLocal,
          isDeletedPublished: false,
        } as EffectivePageSummary;
      })
      .filter((p) => {
        if (p.isDeleted && !includeDeleted) return false;
        if (p.isHidden && !includeHidden) return false;
        return true;
      });

    effectiveNoFs.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return { success: true, data: effectiveNoFs };
  }

  const currentKeyRes = await getCurrentVersionKey();
  const currentVersionKey = currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

  const draftKeyRes = includeDraft ? await getDraftVersionKey() : null;
  const draftVersionKey = includeDraft && draftKeyRes?.success && draftKeyRes.data ? draftKeyRes.data : null;

  const [currentDocsRes, draftDocsRes] = await Promise.all([
    fetchPageDocs(currentVersionKey, ['published']),
    draftVersionKey ? fetchPageDocs(draftVersionKey, ['active']) : Promise.resolve({ success: true, data: [] as ContentPageDoc[] }),
  ]);

  const currentDocs = currentDocsRes.success && currentDocsRes.data ? currentDocsRes.data : [];
  const draftDocs = draftDocsRes.success && draftDocsRes.data ? draftDocsRes.data : [];

  const currentForModule = currentDocs.filter((d) => d.moduleSlug === options.moduleSlug);
  const draftForModule = draftDocs.filter((d) => d.moduleSlug === options.moduleSlug);

  // Keep current/draft separated so the UI can distinguish "deleted in draft" vs "deleted in published".
  const sqliteCurrentById = new Map<number, ContentPageDoc>();
  const sqliteDraftById = new Map<number, ContentPageDoc>();

  for (const d of currentForModule.filter((x) => x.source === 'sqlite')) {
    sqliteCurrentById.set(d.id, d);
  }
  for (const d of draftForModule.filter((x) => x.source === 'sqlite')) {
    sqliteDraftById.set(d.id, d);
  }

  const customCurrentBySlug = new Map<string, ContentPageDoc>();
  const customDraftBySlug = new Map<string, ContentPageDoc>();

  for (const d of currentForModule.filter((x) => x.source === 'custom')) {
    customCurrentBySlug.set(d.slug, d);
  }
  for (const d of draftForModule.filter((x) => x.source === 'custom')) {
    customDraftBySlug.set(d.slug, d);
  }

  const effective: EffectivePageSummary[] = [];

  for (const p of basePages) {
    const currentPatch = sqliteCurrentById.get(p.id);
    const draftPatch = sqliteDraftById.get(p.id);
    const patch = draftPatch ?? currentPatch;

    // Always treat internal layer2 reference pages as hidden unless explicitly requested.
    // This prevents Firestore base mode from rendering JSON payload pages in module accordions.
    const isLayer2 = String(p.slug || '').startsWith('layer2-') || p.page_type === 'layer2';

    // Published tombstone deletes are permanent until reverting to an older version.
    if ((currentPatch?.isDeleted ?? false) === true) continue;

    const isDeletedInDraft = (draftPatch?.isDeleted ?? false) === true;
    if (isDeletedInDraft && !includeDeleted) continue;

    const isHidden = isLayer2 || (patch?.isHidden ?? false) === true;
    if (isHidden && !includeHidden) continue;

    effective.push({
      ...normalizeBasePageSummary(p, patch),
      isHidden,
      isDeleted: isDeletedInDraft,
      isDeletedPublished: false,
    });
  }

  // Append custom pages
  const customSlugs = new Set<string>([...customCurrentBySlug.keys(), ...customDraftBySlug.keys()]);
  for (const slug of customSlugs) {
    const current = customCurrentBySlug.get(slug);
    const draft = customDraftBySlug.get(slug);
    const d = draft ?? current;
    if (!d) continue;

    // Published tombstone deletes are permanent until reverting to an older version.
    if (current?.isDeleted === true) continue;

    const isDeletedInDraft = draft?.isDeleted === true;
    if (isDeletedInDraft && !includeDeleted) continue;

    const isHidden = (draft?.isHidden ?? current?.isHidden) === true;
    if (isHidden && !includeHidden) continue;

    effective.push({
      id: d.id,
      slug: d.slug,
      page_number: typeof d.pageNumber === 'number' ? d.pageNumber : 0,
      title: d.title || d.slug,
      page_type: null,
      sensitivity: null,
      display_order: typeof d.displayOrder === 'number' ? d.displayOrder : 999,
      source: 'custom',
      isHidden,
      isDeleted: isDeletedInDraft,
      isDeletedPublished: false,
    });
  }

  effective.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  return { success: true, data: effective };
}

export async function createDraftCustomPage(
  input: {
    moduleSlug: string;
    title: string;
    purpose?: string | null;
    content?: string;
  },
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<EffectivePageSummary>> {
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

  const existingRes = await getEffectivePagesForModuleSlug({
    moduleSlug: input.moduleSlug,
    includeDraft: true,
    includeHidden: true,
    includeDeleted: true,
  });
  const existing = existingRes.success && existingRes.data ? existingRes.data : [];

  const taken = new Set(existing.map((p) => p.slug));
  const baseSlug = slugify(input.title);
  const pageSlug = ensureUniqueSlug(baseSlug, taken);
  if (!pageSlug) return { success: false, error: 'Please enter a valid title' };

  const maxOrder = existing.reduce((acc, p) => Math.max(acc, p.display_order ?? 0), 0);
  const displayOrder = maxOrder + 1;

  const maxPageNumber = existing.reduce((acc, p) => Math.max(acc, p.page_number ?? 0), 0);
  const pageNumber = maxPageNumber + 1;

  const docId = customPageDocId(input.moduleSlug, pageSlug, draftVersionKey);
  const id = createIdFromDocId(docId);

  try {
    await setDoc(
      doc(firestore, 'contentPages', docId),
      {
        versionId: draftVersionId,
        versionKey: draftVersionKey,
        status: 'active',
        source: 'custom',
        id,
        moduleSlug: input.moduleSlug,
        slug: pageSlug,
        title: input.title.trim(),
        purpose: input.purpose ?? null,
        content: input.content ?? '',
        pageNumber,
        displayOrder,
        isHidden: false,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.displayName || user.email || 'Unknown User',
      } satisfies ContentPageDoc,
      { merge: true }
    );

    return {
      success: true,
      data: {
        id,
        slug: pageSlug,
        page_number: pageNumber,
        title: input.title.trim(),
        page_type: null,
        sensitivity: null,
        display_order: displayOrder,
        source: 'custom',
        isHidden: false,
        isDeleted: false,
      },
    };
  } catch (error) {
    console.error('Error creating custom page:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create page' };
  }
}

async function upsertDraftCustomPagePatch(
  input: {
    moduleSlug: string;
    pageSlug: string;
    patch: Partial<Pick<ContentPageDoc, 'isHidden' | 'isDeleted'>>;
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

  const draftId = customPageDocId(input.moduleSlug, input.pageSlug, draftVersionKey);
  const currentId = customPageDocId(input.moduleSlug, input.pageSlug, currentVersionKey);

  const [draftSnap, currentSnap] = await Promise.all([
    getDoc(doc(firestore, 'contentPages', draftId)),
    getDoc(doc(firestore, 'contentPages', currentId)),
  ]);

  const base = (draftSnap.exists() ? (draftSnap.data() as ContentPageDoc) : null) ||
    (currentSnap.exists() ? (currentSnap.data() as ContentPageDoc) : null);

  if (!base) {
    return { success: false, error: 'Page not found' };
  }

  try {
    await setDoc(
      doc(firestore, 'contentPages', draftId),
      {
        ...base,
        versionId: draftVersionId,
        versionKey: draftVersionKey,
        status: 'active',
        source: 'custom',
        moduleSlug: input.moduleSlug,
        slug: input.pageSlug,
        ...input.patch,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.displayName || user.email || 'Unknown User',
      } satisfies ContentPageDoc,
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error upserting custom page:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update page' };
  }
}

export async function setDraftPageHidden(
  input: {
    moduleSlug: string;
    pageId: number;
    pageSlug: string;
    isHidden: boolean;
    title?: string;
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
    if (input.pageId < 0) {
      return upsertDraftCustomPagePatch(
        { moduleSlug: input.moduleSlug, pageSlug: input.pageSlug, patch: { isHidden: input.isHidden } },
        user
      );
    }

    const docId = sqlitePageDocId(input.pageId, draftVersionKey);
    await setDoc(
      doc(firestore, 'contentPages', docId),
      {
        versionId: draftVersionId,
        versionKey: draftVersionKey,
        status: 'active',
        source: 'sqlite',
        id: input.pageId,
        moduleSlug: input.moduleSlug,
        slug: input.pageSlug,
        title: input.title,
        isHidden: input.isHidden,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.displayName || user.email || 'Unknown User',
      } satisfies ContentPageDoc,
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error setting page hidden:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update page' };
  }
}

export async function setDraftPageDeleted(
  input: {
    moduleSlug: string;
    pageId: number;
    pageSlug: string;
    isDeleted: boolean;
    title?: string;
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
    // Once a delete has been published (currentVersion), it cannot be restored via draft.
    // Restoring requires reverting to an older version in Version Manifest.
    if (input.isDeleted === false) {
      const currentKeyRes = await getCurrentVersionKey();
      const currentVersionKey =
        currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

      const currentId =
        input.pageId < 0
          ? customPageDocId(input.moduleSlug, input.pageSlug, currentVersionKey)
          : sqlitePageDocId(input.pageId, currentVersionKey);

      const currentSnap = await getDoc(doc(firestore, 'contentPages', currentId));
      if (currentSnap.exists() && (currentSnap.data() as ContentPageDoc).isDeleted === true) {
        return {
          success: false,
          error:
            'This page was deleted in a published version. To restore it, revert to an older version in Version Manifest.',
        };
      }
    }

    if (input.pageId < 0) {
      return upsertDraftCustomPagePatch(
        { moduleSlug: input.moduleSlug, pageSlug: input.pageSlug, patch: { isDeleted: input.isDeleted } },
        user
      );
    }

    const docId = sqlitePageDocId(input.pageId, draftVersionKey);
    await setDoc(
      doc(firestore, 'contentPages', docId),
      {
        versionId: draftVersionId,
        versionKey: draftVersionKey,
        status: 'active',
        source: 'sqlite',
        id: input.pageId,
        moduleSlug: input.moduleSlug,
        slug: input.pageSlug,
        title: input.title,
        isDeleted: input.isDeleted,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.displayName || user.email || 'Unknown User',
      } satisfies ContentPageDoc,
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error setting page deleted:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update page' };
  }
}

export async function getEffectivePageDetailForRender(options: {
  moduleSlug: string;
  pageId: number;
  pageSlug: string;
  includeDraft?: boolean;
}): Promise<QueryResult<SectionDetail>> {
  const includeDraft = options.includeDraft ?? false;

  // SQLite-backed page
  if (options.pageId > 0) {
    // If Firestore is available, respect tombstone deletes for sqlite pages too.
    if (firestore) {
      const currentKeyRes = await getCurrentVersionKey();
      const currentVersionKey = currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

      const draftKeyRes = includeDraft ? await getDraftVersionKey() : null;
      const draftVersionKey = includeDraft && draftKeyRes?.success && draftKeyRes.data ? draftKeyRes.data : null;

      try {
        const currentId = sqlitePageDocId(options.pageId, currentVersionKey);
        const draftId = draftVersionKey ? sqlitePageDocId(options.pageId, draftVersionKey) : null;

        const [draftSnap, currentSnap] = await Promise.all([
          draftId ? getDoc(doc(firestore, 'contentPages', draftId)) : Promise.resolve(null),
          getDoc(doc(firestore, 'contentPages', currentId)),
        ]);

        const draftData = draftSnap && (draftSnap as any).exists?.() ? ((draftSnap as any).data() as ContentPageDoc) : null;
        const currentData = currentSnap.exists() ? (currentSnap.data() as ContentPageDoc) : null;

        const data = (includeDraft ? draftData : null) || currentData;
        if (data?.isDeleted === true) {
          return { success: false, error: 'Page deleted' };
        }
      } catch (error) {
        console.error('Error checking page delete status:', error);
      }
    }

    return getSectionDetail(options.pageId);
  }

  if (!firestore) return { success: false, error: 'Firestore is not initialized' };

  const currentKeyRes = await getCurrentVersionKey();
  const currentVersionKey = currentKeyRes.success && currentKeyRes.data ? currentKeyRes.data : '0.1.0';

  const draftKeyRes = includeDraft ? await getDraftVersionKey() : null;
  const draftVersionKey = includeDraft && draftKeyRes?.success && draftKeyRes.data ? draftKeyRes.data : null;

  try {
    const currentId = customPageDocId(options.moduleSlug, options.pageSlug, currentVersionKey);
    const draftId = draftVersionKey ? customPageDocId(options.moduleSlug, options.pageSlug, draftVersionKey) : null;

    const [draftDocSnap, currentDocSnap] = await Promise.all([
      draftId ? getDoc(doc(firestore, 'contentPages', draftId)) : Promise.resolve(null),
      getDoc(doc(firestore, 'contentPages', currentId)),
    ]);

    const draftData = draftDocSnap && (draftDocSnap as any).exists?.() ? ((draftDocSnap as any).data() as ContentPageDoc) : null;
    const currentData = currentDocSnap.exists() ? (currentDocSnap.data() as ContentPageDoc) : null;

    const data = (includeDraft ? draftData : null) || currentData;
    if (!data) {
      return { success: false, error: 'Page not found' };
    }

    if (data.isDeleted === true) {
      return { success: false, error: 'Page deleted' };
    }

    const detail: SectionDetail = {
      id: data.id,
      module_id: 0,
      slug: data.slug,
      page_number: data.pageNumber ?? 0,
      title: data.title || data.slug,
      page_type: null,
      sensitivity: null,
      depth: null,
      purpose: data.purpose ?? null,
      content: data.content ?? '',
      display_order: data.displayOrder ?? 0,
      created_at: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
      scriptures: [],
      external_links: [],
    };

    return { success: true, data: detail };
  } catch (error) {
    console.error('Error loading custom page detail:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load page' };
  }
}
