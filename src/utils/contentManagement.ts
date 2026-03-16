import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { firestore } from '@config/firebase';
import type { QueryResult } from '@/types/database';
import { logActivity } from './activityLog';
import { getDraftVersion, getDraftVersionKey, parseSemanticVersion } from './versionManagement';

/**
 * Content edit stored in Firestore
 * Overrides the original SQLite content
 */
export interface ContentEdit {
  pageId: number; // References the SQLite page.id
  moduleSlug: string;
  pageSlug: string;
  field: 'title' | 'content' | 'purpose'; // Which field was edited
  originalValue: string;
  editedValue: string;
  editedBy: string; // User UID
  editedAt: string;
  // Note: older data may contain status 'published' (from previous publish behavior)
  status: 'active' | 'archived' | 'published';
  versionId: string; // Human-facing semantic version
  versionKey?: string; // Unique snapshot key (UUID in keyed mode)
}

/**
 * Save edited content to Firestore
 * This creates an override that takes precedence over SQLite content
 */
export async function saveContentEdit(
  pageId: number,
  moduleSlug: string,
  pageSlug: string,
  resourceName: string,
  field: 'title' | 'content' | 'purpose',
  originalValue: string,
  editedValue: string,
  userUid: string,
  userEmail: string,
  userName: string
): Promise<QueryResult<ContentEdit>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    // Get the current draft version + key
    const [draftVersionResult, draftKeyResult] = await Promise.all([getDraftVersion(), getDraftVersionKey()]);
    if (!draftVersionResult.success || !draftVersionResult.data) {
      return { success: false, error: draftVersionResult.error || 'Failed to get draft version' };
    }
    if (!draftKeyResult.success || !draftKeyResult.data) {
      return { success: false, error: draftKeyResult.error || 'Failed to get draft version key' };
    }
    const draftVersion = draftVersionResult.data;
    const draftKey = draftKeyResult.data;

    // Create unique ID for this edit (pageId-field-versionKey combination)
    const editId = `${pageId}-${field}-${draftKey}`;
    const editRef = doc(firestore, 'contentEdits', editId);

    const editData: Omit<ContentEdit, 'editedAt'> & { editedAt: any } = {
      pageId,
      moduleSlug,
      pageSlug,
      field,
      originalValue,
      editedValue,
      editedBy: userUid,
      editedAt: serverTimestamp(),
      status: 'active',
      versionId: draftVersion,
      versionKey: draftKey,
    };

    await setDoc(editRef, editData);

    // Log the activity
    await logActivity(
      userUid,
      userEmail,
      userName,
      field === 'title' ? 'edit_title' : field === 'purpose' ? 'edit_purpose' : 'edit_content',
      {
        resourceType: 'page',
        resourceId: pageId,
        resourceName,
        field,
        oldValue: originalValue,
        newValue: editedValue,
        contentEditId: editId,
        undoable: true,
      }
    );

    // Fetch the created document to get the server timestamp
    const createdDoc = await getDoc(editRef);
    const data = createdDoc.data() as ContentEdit;

    return { success: true, data };
  } catch (error) {
    console.error('Error saving content edit:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save content edit',
    };
  }
}

/**
 * Get content edit for a specific page and field
 */
export async function getContentEdit(
  pageId: number,
  field: 'title' | 'content' | 'purpose'
): Promise<QueryResult<ContentEdit | null>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    // Prefer querying by the current draft key to avoid doc-id assumptions.
    const draftKeyResult = await getDraftVersionKey();
    const versionKeyOrId = draftKeyResult.success && draftKeyResult.data ? draftKeyResult.data : null;

    const editsRef = collection(firestore, 'contentEdits');
    const versionField = versionKeyOrId && parseSemanticVersion(versionKeyOrId) ? 'versionId' : 'versionKey';

    const q = versionKeyOrId
      ? query(editsRef, where('pageId', '==', pageId), where('field', '==', field), where('status', '==', 'active'), where(versionField, '==', versionKeyOrId))
      : query(editsRef, where('pageId', '==', pageId), where('field', '==', field), where('status', '==', 'active'));

    const snap = await getDocs(q);
    if (snap.empty) return { success: true, data: null };

    const data = snap.docs[0].data() as ContentEdit;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching content edit:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch content edit',
    };
  }
}

/**
 * Get all active content edits for a page
 * @param pageId - The page ID to get edits for
 * @param versionId - Optional version ID to filter by (defaults to current published version)
 */
export async function getPageContentEdits(
  pageId: number,
  versionKeyOrId: string
): Promise<QueryResult<Map<string, ContentEdit>>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const editsRef = collection(firestore, 'contentEdits');
    const versionField = parseSemanticVersion(versionKeyOrId) ? 'versionId' : 'versionKey';
    const q = query(
      editsRef,
      where('pageId', '==', pageId),
      // Include legacy published edits so currentVersion renders correctly
      where('status', 'in', ['active', 'published']),
      where(versionField, '==', versionKeyOrId)
    );

    const querySnapshot = await getDocs(q);
    const edits = new Map<string, ContentEdit>();

    querySnapshot.forEach((doc) => {
      const edit = doc.data() as ContentEdit;
      edits.set(edit.field, edit);
    });

    return { success: true, data: edits };
  } catch (error) {
    console.error('Error fetching page content edits:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch page content edits',
    };
  }
}

/**
 * Get all (active/published) content edits for a module + version.
 * Useful for preloading edits (e.g., accordion titles) without loading each page detail.
 */
export async function getModuleContentEdits(
  moduleSlug: string,
  versionKeyOrId: string
): Promise<QueryResult<ContentEdit[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const editsRef = collection(firestore, 'contentEdits');
    const versionField = parseSemanticVersion(versionKeyOrId) ? 'versionId' : 'versionKey';
    const q = query(
      editsRef,
      where('moduleSlug', '==', moduleSlug),
      where(versionField, '==', versionKeyOrId),
      where('status', 'in', ['active', 'published'])
    );

    const snapshot = await getDocs(q);
    const edits: ContentEdit[] = [];
    snapshot.forEach((docSnap) => {
      edits.push(docSnap.data() as ContentEdit);
    });

    return { success: true, data: edits };
  } catch (error) {
    console.error('Error fetching module content edits:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch module content edits',
    };
  }
}

/**
 * Archive a content edit (revert to original)
 */
export async function archiveContentEdit(
  pageId: number,
  field: 'title' | 'content' | 'purpose',
  _resourceName: string,
  _userUid: string,
  _userEmail: string,
  _userName: string
): Promise<QueryResult<void>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    // Draft edits can have a version-specific document ID. To avoid "undo" breaking after
    // a draft version change, locate the active draft edit by query instead of by doc ID.
    const draftKeyResult = await getDraftVersionKey();
    if (!draftKeyResult.success || !draftKeyResult.data) {
      return { success: false, error: 'Failed to get draft version key' };
    }
    const draftKeyOrId = draftKeyResult.data;
    const versionField = parseSemanticVersion(draftKeyOrId) ? 'versionId' : 'versionKey';

    const editsRef = collection(firestore, 'contentEdits');
    const q = query(
      editsRef,
      where('pageId', '==', pageId),
      where('field', '==', field),
      where('status', '==', 'active'),
      where(versionField, '==', draftKeyOrId)
    );

    const snapshot = await getDocs(q);
    const matchingDoc = snapshot.docs[0];

    if (!matchingDoc) {
      // No active draft edit exists for this field; treat as no-op.
      return { success: true };
    }

    await setDoc(
      matchingDoc.ref,
      {
        status: 'archived',
      },
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error archiving content edit:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive content edit',
    };
  }
}

/**
 * Apply content edits to page data
 * This merges Firestore edits with SQLite data
 */
export function applyContentEdits<T extends { id: number; title?: string; content?: string; purpose?: string }>(
  pageData: T,
  edits: Map<string, ContentEdit> | null
): T {
  if (!edits || edits.size === 0) {
    return pageData;
  }

  const result = { ...pageData };

  edits.forEach((edit, field) => {
    if (field in result) {
      (result as any)[field] = edit.editedValue;
    }
  });

  return result;
}

/**
 * Bulk revert all edits for a specific page
 * Archives all active content edits for the given page
 */
export async function bulkRevertPageEdits(
  pageId: number,
  resourceName: string,
  userUid: string,
  userEmail: string,
  userName: string
): Promise<QueryResult<number>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    // Bulk revert operates on the draft version (same view editors use)
    const draftKeyResult = await getDraftVersionKey();
    if (!draftKeyResult.success || !draftKeyResult.data) {
      return { success: false, error: draftKeyResult.error || 'Failed to get draft version key' };
    }

    const editsResult = await getPageContentEdits(pageId, draftKeyResult.data);
    if (!editsResult.success || !editsResult.data) {
      return { success: false, error: editsResult.error || 'Failed to fetch page edits' };
    }

    const edits = editsResult.data;
    let revertedCount = 0;

    // Archive each edit
    for (const [field, _edit] of edits.entries()) {
      const result = await archiveContentEdit(
        pageId,
        field as 'title' | 'content' | 'purpose',
        resourceName,
        userUid,
        userEmail,
        userName
      );
      if (result.success) {
        revertedCount++;
      }
    }

    return { success: true, data: revertedCount };
  } catch (error) {
    console.error('Error bulk reverting page edits:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to bulk revert edits',
    };
  }
}

/**
 * Get all pages with active edits for a module
 */
export async function getModuleEditedPages(
  moduleSlug: string
): Promise<QueryResult<number[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const editsRef = collection(firestore, 'contentEdits');
    const q = query(
      editsRef,
      where('moduleSlug', '==', moduleSlug),
      where('status', 'in', ['active', 'published'])
    );

    const querySnapshot = await getDocs(q);
    const pageIds = new Set<number>();

    querySnapshot.forEach((doc) => {
      const edit = doc.data() as ContentEdit;
      pageIds.add(edit.pageId);
    });

    return { success: true, data: Array.from(pageIds) };
  } catch (error) {
    console.error('Error fetching module edited pages:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch edited pages',
    };
  }
}

/**
 * Get all module slugs that have active edits
 */
export async function getAllEditedModules(): Promise<QueryResult<string[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const editsRef = collection(firestore, 'contentEdits');
    const q = query(editsRef, where('status', 'in', ['active', 'published']));

    const querySnapshot = await getDocs(q);
    const moduleSlugs = new Set<string>();

    querySnapshot.forEach((doc) => {
      const edit = doc.data() as ContentEdit;
      moduleSlugs.add(edit.moduleSlug);
    });

    return { success: true, data: Array.from(moduleSlugs) };
  } catch (error) {
    console.error('Error fetching edited modules:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch edited modules',
    };
  }
}
