import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { firestore } from '@config/firebase';
import type { QueryResult } from '@/types/database';

/**
 * Version status
 */
export type VersionStatus = 'draft' | 'published' | 'archived';

/**
 * Version information
 */
export interface Version {
  /**
   * Human-facing semantic version number (may repeat across resets).
   */
  versionId: string;

  /**
   * Unique snapshot identifier for this version record.
   * In the "keyed" system, this is a UUID and also the Firestore doc ID in /versions.
   */
  versionKey?: string;

  /**
   * Unique identifier for the current versioning epoch (changes on reset).
   * Used to scope history so repeated semantic versions don't collide.
   */
  epochId?: string;

  status: VersionStatus;
  createdAt: string | Timestamp;
  createdBy: string;
  createdByName: string;
  publishedAt: string | Timestamp | null;
  publishedBy: string | null;
  publishedByName: string | null;
  changes: VersionChange[];
  description: string;
  changeCount: number;
}

/**
 * Summary of a change in a version
 */
export interface VersionChange {
  pageId: number;
  pageName: string;
  moduleSlug: string;
  field: 'title' | 'content' | 'purpose' | 'catalog';
  action: 'edit_title' | 'edit_content' | 'edit_purpose' | 'catalog_overlay';
  editedBy: string;
  editedByName: string;
  editedAt: string | Timestamp;
  metadata?: Record<string, any>;
}

/**
 * App configuration with current and draft versions
 */
export interface AppConfig {
  // Human-facing semantic versions
  currentVersion: string; // Currently published version
  draftVersion: string; // Next version being worked on

  // Keyed mode (UUID snapshots)
  epochId?: string;
  currentVersionKey?: string;
  draftVersionKey?: string;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  // Fallback (should be rare in modern browsers)
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isKeyedConfig(config: Partial<AppConfig> | null): boolean {
  return Boolean(
    config &&
      typeof config.epochId === 'string' &&
      typeof config.currentVersionKey === 'string' &&
      typeof config.draftVersionKey === 'string'
  );
}

async function getVersionConfigDoc(): Promise<QueryResult<AppConfig>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const configRef = doc(firestore, 'appConfig', 'versionConfig');
    const configDoc = await getDoc(configRef);

    if (!configDoc.exists()) {
      return {
        success: true,
        data: {
          currentVersion: '0.1.0',
          draftVersion: '0.1.1',
        },
      };
    }

    const data = configDoc.data() as Partial<AppConfig>;
    return {
      success: true,
      data: {
        currentVersion: typeof data.currentVersion === 'string' ? data.currentVersion : '0.1.0',
        draftVersion: typeof data.draftVersion === 'string' ? data.draftVersion : '0.1.1',
        epochId: typeof data.epochId === 'string' ? data.epochId : undefined,
        currentVersionKey: typeof data.currentVersionKey === 'string' ? data.currentVersionKey : undefined,
        draftVersionKey: typeof data.draftVersionKey === 'string' ? data.draftVersionKey : undefined,
      },
    };
  } catch (error) {
    console.error('Error getting version config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get version config',
    };
  }
}

export async function getCurrentVersionKey(): Promise<QueryResult<string>> {
  const cfg = await getVersionConfigDoc();
  if (!cfg.success) return { success: false, error: cfg.error || 'Failed to get version config' };
  if (!cfg.data) return { success: false, error: 'Failed to get version config' };

  if (isKeyedConfig(cfg.data)) {
    return { success: true, data: cfg.data.currentVersionKey! };
  }

  // Legacy mode: version key is the semantic version.
  return { success: true, data: cfg.data.currentVersion };
}

export async function getDraftVersionKey(): Promise<QueryResult<string>> {
  const cfg = await getVersionConfigDoc();
  if (!cfg.success) return { success: false, error: cfg.error || 'Failed to get version config' };
  if (!cfg.data) return { success: false, error: 'Failed to get version config' };

  if (isKeyedConfig(cfg.data)) {
    return { success: true, data: cfg.data.draftVersionKey! };
  }

  // Legacy mode: version key is the semantic version.
  return { success: true, data: cfg.data.draftVersion };
}

export async function getCurrentEpochId(): Promise<QueryResult<string | null>> {
  const cfg = await getVersionConfigDoc();
  if (!cfg.success) return { success: false, error: cfg.error || 'Failed to get version config' };
  if (!cfg.data) return { success: false, error: 'Failed to get version config' };
  return { success: true, data: cfg.data.epochId ?? null };
}

/**
 * Get the current published version
 */
export async function getCurrentVersion(): Promise<QueryResult<string>> {
  const cfg = await getVersionConfigDoc();
  if (!cfg.success) return { success: false, error: cfg.error || 'Failed to get version config' };
  if (!cfg.data) return { success: false, error: 'Failed to get version config' };
  return { success: true, data: cfg.data.currentVersion };
}

/**
 * Get the draft version
 */
export async function getDraftVersion(): Promise<QueryResult<string>> {
  const cfg = await getVersionConfigDoc();
  if (!cfg.success) return { success: false, error: cfg.error || 'Failed to get version config' };
  if (!cfg.data) return { success: false, error: 'Failed to get version config' };
  return { success: true, data: cfg.data.draftVersion };
}

/**
 * Set the current live (published) content version.
 * This affects which published content edits are applied for all users.
 */
export async function setCurrentVersion(versionIdOrKey: string): Promise<QueryResult<void>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const cfgRes = await getVersionConfigDoc();
    if (!cfgRes.success || !cfgRes.data) {
      return { success: false, error: cfgRes.error || 'Failed to load version config' };
    }

    const cfg = cfgRes.data;
    const keyed = isKeyedConfig(cfg);

    // Legacy mode: version doc IDs are the semantic version.
    if (!keyed) {
      // Validate semantic version format
      if (!parseSemanticVersion(versionIdOrKey)) {
        return { success: false, error: 'Invalid semantic version format. Use X.Y.Z format.' };
      }

      const versionRef = doc(firestore, 'versions', versionIdOrKey);
      const versionDoc = await getDoc(versionRef);
      if (!versionDoc.exists()) {
        return { success: false, error: `Version ${versionIdOrKey} not found` };
      }

      const versionData = versionDoc.data() as any;
      if (versionData.status !== 'published') {
        return { success: false, error: `Version ${versionIdOrKey} is not published` };
      }

      await setDoc(doc(firestore, 'appConfig', 'versionConfig'), { currentVersion: versionIdOrKey }, { merge: true });
      return { success: true };
    }

    // Keyed mode: version doc IDs are UUIDs (versionKey).
    let versionKey = versionIdOrKey;

    // Allow callers to pass a semantic version; resolve it to the latest matching snapshot in this epoch.
    if (parseSemanticVersion(versionIdOrKey)) {
      const epochId = cfg.epochId!;
      const versionsRef = collection(firestore, 'versions');
      const q = query(
        versionsRef,
        where('epochId', '==', epochId),
        where('versionId', '==', versionIdOrKey),
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        return { success: false, error: `Version ${versionIdOrKey} not found in this epoch` };
      }
      versionKey = snap.docs[0].id;
    }

    const versionRef = doc(firestore, 'versions', versionKey);
    const versionDoc = await getDoc(versionRef);
    if (!versionDoc.exists()) {
      return { success: false, error: `Version snapshot not found` };
    }

    const versionData = versionDoc.data() as any;
    if (versionData.status !== 'published') {
      return { success: false, error: `Selected version is not published` };
    }

    const versionId = typeof versionData.versionId === 'string' ? versionData.versionId : cfg.currentVersion;

    await setDoc(
      doc(firestore, 'appConfig', 'versionConfig'),
      {
        currentVersion: versionId,
        currentVersionKey: versionKey,
        epochId: typeof versionData.epochId === 'string' ? versionData.epochId : cfg.epochId,
      },
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error setting current version:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set current version',
    };
  }
}

/**
 * Archive (remove from history) a published version.
 * This does NOT delete any data; it simply sets versions/{versionId}.status = 'archived'.
 */
export async function archiveVersion(versionIdOrKey: string): Promise<QueryResult<void>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const cfgRes = await getVersionConfigDoc();
    if (!cfgRes.success || !cfgRes.data) {
      return { success: false, error: cfgRes.error || 'Failed to load version config' };
    }

    const cfg = cfgRes.data;
    const keyed = isKeyedConfig(cfg);

    // Legacy mode: version doc IDs are semantic.
    if (!keyed) {
      if (!parseSemanticVersion(versionIdOrKey)) {
        return { success: false, error: 'Invalid semantic version format. Use X.Y.Z format.' };
      }

      const versionRef = doc(firestore, 'versions', versionIdOrKey);
      const versionDoc = await getDoc(versionRef);
      if (!versionDoc.exists()) {
        return { success: false, error: `Version ${versionIdOrKey} not found` };
      }

      const versionData = versionDoc.data() as any;
      if (versionData.status !== 'published') {
        return { success: false, error: `Only published versions can be removed` };
      }

      await setDoc(versionRef, { status: 'archived', archivedAt: serverTimestamp() }, { merge: true });
      return { success: true };
    }

    // Keyed mode
    let versionKey = versionIdOrKey;

    if (parseSemanticVersion(versionIdOrKey)) {
      const epochId = cfg.epochId!;
      const versionsRef = collection(firestore, 'versions');
      const q = query(
        versionsRef,
        where('epochId', '==', epochId),
        where('versionId', '==', versionIdOrKey),
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        return { success: false, error: `Version ${versionIdOrKey} not found in this epoch` };
      }
      versionKey = snap.docs[0].id;
    }

    const versionRef = doc(firestore, 'versions', versionKey);
    const versionDoc = await getDoc(versionRef);
    if (!versionDoc.exists()) {
      return { success: false, error: `Version snapshot not found` };
    }

    const versionData = versionDoc.data() as any;
    if (versionData.status !== 'published') {
      return { success: false, error: `Only published versions can be removed` };
    }

    await setDoc(versionRef, { status: 'archived', archivedAt: serverTimestamp() }, { merge: true });
    return { success: true };
  } catch (error) {
    console.error('Error archiving version:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove version',
    };
  }
}

/**
 * Reset versioning to the base starting point.
 * - Ensures versions/{baseVersion} exists and is published
 * - Ensures versions/{draftVersion} exists and is draft
 * - Sets appConfig/versionConfig currentVersion + draftVersion
 */
export async function resetVersioningToBase(
  baseVersion: string,
  draftVersion: string,
  userId: string,
  userName: string
): Promise<QueryResult<void>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    if (!parseSemanticVersion(baseVersion) || !parseSemanticVersion(draftVersion)) {
      return { success: false, error: 'Invalid semantic version format. Use X.Y.Z format.' };
    }

    // New epoch: version numbers may repeat, so every snapshot must be uniquely keyed.
    const epochId = generateUuid();
    const baseKey = generateUuid();
    const draftKey = generateUuid();

    // Base published version doc (keyed)
    await setDoc(
      doc(firestore, 'versions', baseKey),
      {
        versionId: baseVersion,
        versionKey: baseKey,
        epochId,
        status: 'published',
        createdAt: serverTimestamp(),
        createdBy: userId,
        createdByName: userName,
        publishedAt: serverTimestamp(),
        publishedBy: userId,
        publishedByName: userName,
        description: 'Base starting version',
        changes: [],
        changeCount: 0,
      },
      { merge: true }
    );

    // Draft version doc (keyed)
    await setDoc(
      doc(firestore, 'versions', draftKey),
      {
        versionId: draftVersion,
        versionKey: draftKey,
        epochId,
        status: 'draft',
        createdAt: serverTimestamp(),
        createdBy: userId,
        createdByName: userName,
        publishedAt: null,
        publishedBy: null,
        publishedByName: null,
        description: 'Draft version for new edits',
        changes: [],
        changeCount: 0,
      },
      { merge: true }
    );

    // Update app config to keyed mode
    await setDoc(
      doc(firestore, 'appConfig', 'versionConfig'),
      {
        epochId,
        currentVersion: baseVersion,
        currentVersionKey: baseKey,
        draftVersion,
        draftVersionKey: draftKey,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error resetting versioning:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset versioning',
    };
  }
}

/**
 * Create a new version
 */
export async function createVersion(
  versionId: string,
  description: string,
  userId: string,
  userName: string
): Promise<QueryResult<Version>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    // Validate semantic version format
    if (!parseSemanticVersion(versionId)) {
      return { success: false, error: 'Invalid semantic version format. Use X.Y.Z format.' };
    }

    const cfgRes = await getVersionConfigDoc();
    if (!cfgRes.success || !cfgRes.data) {
      return { success: false, error: cfgRes.error || 'Failed to load version config' };
    }

    const cfg = cfgRes.data;
    const keyed = isKeyedConfig(cfg);

    // Legacy mode: doc ID is the semantic version.
    if (!keyed) {
      const versionRef = doc(firestore, 'versions', versionId);
      const versionDoc = await getDoc(versionRef);

      if (versionDoc.exists()) {
        return { success: false, error: `Version ${versionId} already exists` };
      }

      const versionData: Omit<Version, 'createdAt'> & { createdAt: any } = {
        versionId,
        status: 'draft',
        createdAt: serverTimestamp(),
        createdBy: userId,
        createdByName: userName,
        publishedAt: null,
        publishedBy: null,
        publishedByName: null,
        changes: [],
        description,
        changeCount: 0,
      };

      await setDoc(versionRef, versionData);

      return {
        success: true,
        data: {
          ...versionData,
          createdAt: new Date().toISOString(),
        },
      };
    }

    // Keyed mode: doc ID is a UUID (versionKey). Ensure semantic version isn't already used in this epoch.
    const epochId = cfg.epochId!;
    const existing = await getDocs(
      query(collection(firestore, 'versions'), where('epochId', '==', epochId), where('versionId', '==', versionId), limit(1))
    );
    if (!existing.empty) {
      return { success: false, error: `Version ${versionId} already exists in this epoch` };
    }

    const versionKey = generateUuid();
    const versionRef = doc(firestore, 'versions', versionKey);

    const versionData: Omit<Version, 'createdAt'> & { createdAt: any } = {
      versionId,
      versionKey,
      epochId,
      status: 'draft',
      createdAt: serverTimestamp(),
      createdBy: userId,
      createdByName: userName,
      publishedAt: null,
      publishedBy: null,
      publishedByName: null,
      changes: [],
      description,
      changeCount: 0,
    };

    await setDoc(versionRef, versionData);

    return {
      success: true,
      data: {
        ...versionData,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('Error creating version:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create version',
    };
  }
}

/**
 * Publish a version (make it the current live version)
 */
export async function publishVersion(
  versionId: string,
  userId: string,
  userName: string,
  nextDraftVersion: string
): Promise<QueryResult<void>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  const db = firestore;

  try {
    const cfgRes = await getVersionConfigDoc();
    if (!cfgRes.success || !cfgRes.data) {
      return { success: false, error: cfgRes.error || 'Failed to load version config' };
    }

    const cfg = cfgRes.data;
    const keyed = isKeyedConfig(cfg);

    // Legacy mode
    if (!keyed) {
      const versionRef = doc(firestore, 'versions', versionId);
      const existingVersionDoc = await getDoc(versionRef);

      // Gather draft edits for this version (these are what we're publishing)
      const editsRef = collection(firestore, 'contentEdits');
      const editsQuery = query(editsRef, where('versionId', '==', versionId), where('status', '==', 'active'));
      const editsSnapshot = await getDocs(editsQuery);

      const contentEditChanges: VersionChange[] = editsSnapshot.docs.map((docSnap) => {
        const data = docSnap.data() as any;
        const field: 'title' | 'content' | 'purpose' = data.field;
        return {
          pageId: data.pageId,
          pageName: data.pageSlug || String(data.pageId),
          moduleSlug: data.moduleSlug,
          field,
          action: field === 'title' ? 'edit_title' : field === 'purpose' ? 'edit_purpose' : 'edit_content',
          editedBy: data.editedBy,
          editedByName: data.editedBy,
          editedAt: data.editedAt,
        };
      });

      const [catsSnap, modsSnap, pagesSnap] = await Promise.all([
        getDocs(query(collection(db, 'contentCategories'), where('versionId', '==', versionId), where('status', '==', 'active'))),
        getDocs(query(collection(db, 'contentModules'), where('versionId', '==', versionId), where('status', '==', 'active'))),
        getDocs(query(collection(db, 'contentPages'), where('versionId', '==', versionId), where('status', '==', 'active'))),
      ]);

      const overlayChanges: VersionChange[] = [];
      const pushOverlay = (collectionName: string, d: any) => {
        const kind = collectionName === 'contentCategories' ? 'category' : collectionName === 'contentModules' ? 'module' : 'page';
        const slug = d.slug || '';
        const moduleSlug = kind === 'page' ? (d.moduleSlug || '') : slug;

        overlayChanges.push({
          pageId: typeof d.id === 'number' ? d.id : 0,
          pageName: kind === 'page' ? `${d.moduleSlug || ''}/${slug}` : slug,
          moduleSlug,
          field: 'catalog',
          action: 'catalog_overlay',
          editedBy: d.updatedBy || userId,
          editedByName: d.updatedByName || userName,
          editedAt: d.updatedAt || new Date().toISOString(),
          metadata: {
            collection: collectionName,
            kind,
            ...(d.source ? { source: d.source } : {}),
            isHidden: d.isHidden === true,
            isDeleted: d.isDeleted === true,
          },
        });
      };

      catsSnap.forEach((docSnap) => pushOverlay('contentCategories', docSnap.data()));
      modsSnap.forEach((docSnap) => pushOverlay('contentModules', docSnap.data()));
      pagesSnap.forEach((docSnap) => pushOverlay('contentPages', docSnap.data()));

      const changes: VersionChange[] = [...contentEditChanges, ...overlayChanges];

      const autoDescription = `Published ${changes.length} change${changes.length === 1 ? '' : 's'} (content edits: ${contentEditChanges.length}, overlays: ${overlayChanges.length}).`;

      if (!existingVersionDoc.exists()) {
        const versionData: Omit<Version, 'createdAt' | 'publishedAt'> & { createdAt: any; publishedAt: any } = {
          versionId,
          status: 'published',
          createdAt: serverTimestamp(),
          createdBy: userId,
          createdByName: userName,
          publishedAt: serverTimestamp(),
          publishedBy: userId,
          publishedByName: userName,
          changes,
          description: autoDescription,
          changeCount: changes.length,
        };
        await setDoc(versionRef, versionData);
      } else {
        const existingData = existingVersionDoc.data() as any;
        const existingDescription = typeof existingData?.description === 'string' ? existingData.description.trim() : '';

        const isPlaceholderDescription =
          !existingDescription ||
          existingDescription === 'Draft version for new edits' ||
          existingDescription === 'Base starting version';

        await setDoc(
          versionRef,
          {
            status: 'published',
            publishedAt: serverTimestamp(),
            publishedBy: userId,
            publishedByName: userName,
            changes,
            changeCount: changes.length,
            ...(isPlaceholderDescription ? { description: autoDescription } : {}),
          },
          { merge: true }
        );
      }

      await Promise.all(editsSnapshot.docs.map((docSnap) => setDoc(docSnap.ref, { status: 'published' }, { merge: true })));

      const promoteCollection = async (collectionName: 'contentCategories' | 'contentModules' | 'contentPages') => {
        const ref = collection(db, collectionName);
        const q = query(ref, where('versionId', '==', versionId), where('status', '==', 'active'));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map((d) => setDoc(d.ref, { status: 'published' }, { merge: true })));
      };

      await Promise.all([
        promoteCollection('contentCategories'),
        promoteCollection('contentModules'),
        promoteCollection('contentPages'),
      ]);

      await setDoc(doc(firestore, 'appConfig', 'versionConfig'), { currentVersion: versionId, draftVersion: nextDraftVersion }, { merge: true });
      return { success: true };
    }

    // Keyed mode: publish the current draft snapshot (UUID) and create a new draft snapshot.
    const epochId = cfg.epochId!;
    const draftKey = cfg.draftVersionKey!;
    const draftSemantic = cfg.draftVersion;

    const versionRef = doc(db, 'versions', draftKey);
    const existingVersionDoc = await getDoc(versionRef);

    const editsRef = collection(db, 'contentEdits');
    const editsQuery = query(editsRef, where('versionKey', '==', draftKey), where('status', '==', 'active'));
    const editsSnapshot = await getDocs(editsQuery);

    const contentEditChanges: VersionChange[] = editsSnapshot.docs.map((docSnap) => {
      const data = docSnap.data() as any;
      const field: 'title' | 'content' | 'purpose' = data.field;
      return {
        pageId: data.pageId,
        pageName: data.pageSlug || String(data.pageId),
        moduleSlug: data.moduleSlug,
        field,
        action: field === 'title' ? 'edit_title' : field === 'purpose' ? 'edit_purpose' : 'edit_content',
        editedBy: data.editedBy,
        editedByName: data.editedBy,
        editedAt: data.editedAt,
      };
    });

    const [catsSnap, modsSnap, pagesSnap] = await Promise.all([
      getDocs(query(collection(db, 'contentCategories'), where('versionKey', '==', draftKey), where('status', '==', 'active'))),
      getDocs(query(collection(db, 'contentModules'), where('versionKey', '==', draftKey), where('status', '==', 'active'))),
      getDocs(query(collection(db, 'contentPages'), where('versionKey', '==', draftKey), where('status', '==', 'active'))),
    ]);

    const overlayChanges: VersionChange[] = [];
    const pushOverlay = (collectionName: string, d: any) => {
      const kind = collectionName === 'contentCategories' ? 'category' : collectionName === 'contentModules' ? 'module' : 'page';
      const slug = d.slug || '';
      const moduleSlug = kind === 'page' ? (d.moduleSlug || '') : slug;

      overlayChanges.push({
        pageId: typeof d.id === 'number' ? d.id : 0,
        pageName: kind === 'page' ? `${d.moduleSlug || ''}/${slug}` : slug,
        moduleSlug,
        field: 'catalog',
        action: 'catalog_overlay',
        editedBy: d.updatedBy || userId,
        editedByName: d.updatedByName || userName,
        editedAt: d.updatedAt || new Date().toISOString(),
        metadata: {
          collection: collectionName,
          kind,
          ...(d.source ? { source: d.source } : {}),
          isHidden: d.isHidden === true,
          isDeleted: d.isDeleted === true,
        },
      });
    };

    catsSnap.forEach((docSnap) => pushOverlay('contentCategories', docSnap.data()));
    modsSnap.forEach((docSnap) => pushOverlay('contentModules', docSnap.data()));
    pagesSnap.forEach((docSnap) => pushOverlay('contentPages', docSnap.data()));

    const changes: VersionChange[] = [...contentEditChanges, ...overlayChanges];
    const autoDescription = `Published ${changes.length} change${changes.length === 1 ? '' : 's'} (content edits: ${contentEditChanges.length}, overlays: ${overlayChanges.length}).`;

    if (!existingVersionDoc.exists()) {
      const versionData: Omit<Version, 'createdAt' | 'publishedAt'> & { createdAt: any; publishedAt: any } = {
        versionId: draftSemantic,
        versionKey: draftKey,
        epochId,
        status: 'published',
        createdAt: serverTimestamp(),
        createdBy: userId,
        createdByName: userName,
        publishedAt: serverTimestamp(),
        publishedBy: userId,
        publishedByName: userName,
        changes,
        description: autoDescription,
        changeCount: changes.length,
      };
      await setDoc(versionRef, versionData);
    } else {
      const existingData = existingVersionDoc.data() as any;
      const existingDescription = typeof existingData?.description === 'string' ? existingData.description.trim() : '';

      const isPlaceholderDescription =
        !existingDescription ||
        existingDescription === 'Draft version for new edits' ||
        existingDescription === 'Base starting version';

      await setDoc(
        versionRef,
        {
          versionId: draftSemantic,
          versionKey: draftKey,
          epochId,
          status: 'published',
          publishedAt: serverTimestamp(),
          publishedBy: userId,
          publishedByName: userName,
          changes,
          changeCount: changes.length,
          ...(isPlaceholderDescription ? { description: autoDescription } : {}),
        },
        { merge: true }
      );
    }

    await Promise.all(editsSnapshot.docs.map((docSnap) => setDoc(docSnap.ref, { status: 'published' }, { merge: true })));

    const promoteCollection = async (collectionName: 'contentCategories' | 'contentModules' | 'contentPages') => {
      const ref = collection(db, collectionName);
      const q = query(ref, where('versionKey', '==', draftKey), where('status', '==', 'active'));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map((d) => setDoc(d.ref, { status: 'published' }, { merge: true })));
    };

    await Promise.all([
      promoteCollection('contentCategories'),
      promoteCollection('contentModules'),
      promoteCollection('contentPages'),
    ]);

    const nextDraftKey = generateUuid();

    await setDoc(
      doc(db, 'versions', nextDraftKey),
      {
        versionId: nextDraftVersion,
        versionKey: nextDraftKey,
        epochId,
        status: 'draft',
        createdAt: serverTimestamp(),
        createdBy: userId,
        createdByName: userName,
        publishedAt: null,
        publishedBy: null,
        publishedByName: null,
        description: 'Draft version for new edits',
        changes: [],
        changeCount: 0,
      },
      { merge: true }
    );

    await setDoc(
      doc(db, 'appConfig', 'versionConfig'),
      {
        epochId,
        currentVersion: draftSemantic,
        currentVersionKey: draftKey,
        draftVersion: nextDraftVersion,
        draftVersionKey: nextDraftKey,
      },
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error publishing version:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to publish version',
    };
  }
}

/**
 * Get all versions
 */
export async function getAllVersions(): Promise<QueryResult<Version[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const versionsRef = collection(firestore, 'versions');
    const q = query(versionsRef, orderBy('createdAt', 'desc'));

    const snapshot = await getDocs(q);

    const versions: Version[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as any;
      versions.push({
        ...data,
        versionKey: typeof data.versionKey === 'string' ? data.versionKey : docSnap.id,
        epochId: typeof data.epochId === 'string' ? data.epochId : undefined,
        createdAt:
          data.createdAt instanceof Timestamp
            ? data.createdAt.toDate().toISOString()
            : data.createdAt,
        publishedAt:
          data.publishedAt instanceof Timestamp
            ? data.publishedAt.toDate().toISOString()
            : data.publishedAt,
      } as Version);
    });

    return { success: true, data: versions };
  } catch (error) {
    console.error('Error getting versions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get versions',
    };
  }
}

/**
 * Get a specific version
 */
export async function getVersion(versionIdOrKey: string): Promise<QueryResult<Version | null>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const cfgRes = await getVersionConfigDoc();
    if (!cfgRes.success || !cfgRes.data) {
      return { success: false, error: cfgRes.error || 'Failed to load version config' };
    }

    const cfg = cfgRes.data;
    const keyed = isKeyedConfig(cfg);

    // Legacy mode
    if (!keyed) {
      const versionRef = doc(firestore, 'versions', versionIdOrKey);
      const versionDoc = await getDoc(versionRef);

      if (!versionDoc.exists()) {
        return { success: true, data: null };
      }

      const data = versionDoc.data();
      return {
        success: true,
        data: {
          ...data,
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt,
          publishedAt:
            data.publishedAt instanceof Timestamp
              ? data.publishedAt.toDate().toISOString()
              : data.publishedAt,
        } as Version,
      };
    }

    // Keyed mode: accept UUID key or semantic version (resolved within this epoch)
    let versionKey = versionIdOrKey;
    if (parseSemanticVersion(versionIdOrKey)) {
      const epochId = cfg.epochId!;
      const snap = await getDocs(
        query(
          collection(firestore, 'versions'),
          where('epochId', '==', epochId),
          where('versionId', '==', versionIdOrKey),
          orderBy('createdAt', 'desc'),
          limit(1)
        )
      );
      if (snap.empty) {
        return { success: true, data: null };
      }
      versionKey = snap.docs[0].id;
    }

    const versionRef = doc(firestore, 'versions', versionKey);
    const versionDoc = await getDoc(versionRef);

    if (!versionDoc.exists()) {
      return { success: true, data: null };
    }

    const data = versionDoc.data() as any;

    return {
      success: true,
      data: {
        ...data,
        versionKey: typeof data.versionKey === 'string' ? data.versionKey : versionKey,
        epochId: typeof data.epochId === 'string' ? data.epochId : cfg.epochId,
        createdAt:
          data.createdAt instanceof Timestamp
            ? data.createdAt.toDate().toISOString()
            : data.createdAt,
        publishedAt:
          data.publishedAt instanceof Timestamp
            ? data.publishedAt.toDate().toISOString()
            : data.publishedAt,
      } as Version,
    };
  } catch (error) {
    console.error('Error getting version:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get version',
    };
  }
}

export async function updateVersionDescription(
  versionIdOrKey: string,
  description: string
): Promise<QueryResult<void>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const cfgRes = await getVersionConfigDoc();
    if (!cfgRes.success || !cfgRes.data) {
      return { success: false, error: cfgRes.error || 'Failed to load version config' };
    }

    const cfg = cfgRes.data;
    const keyed = isKeyedConfig(cfg);

    let versionKey = versionIdOrKey;

    if (keyed && parseSemanticVersion(versionIdOrKey)) {
      const epochId = cfg.epochId!;
      const snap = await getDocs(
        query(
          collection(firestore, 'versions'),
          where('epochId', '==', epochId),
          where('versionId', '==', versionIdOrKey),
          orderBy('createdAt', 'desc'),
          limit(1)
        )
      );
      if (snap.empty) {
        return { success: false, error: `Version ${versionIdOrKey} not found in this epoch` };
      }
      versionKey = snap.docs[0].id;
    }

    if (!keyed && !parseSemanticVersion(versionIdOrKey)) {
      return { success: false, error: 'Invalid semantic version format. Use X.Y.Z format.' };
    }

    await setDoc(
      doc(firestore, 'versions', versionKey),
      {
        description: description.trim(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error updating version description:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update version description' };
  }
}

/**
 * Extended version info with content edits
 */
export interface VersionWithChangelog extends Version {
  contentEdits: VersionContentEdit[];
  catalogOverlays: VersionCatalogOverlay[];
}

/**
 * Content edit information for version changelog
 */
export interface VersionContentEdit {
  pageId: number;
  moduleSlug: string;
  pageSlug: string;
  field: 'title' | 'content' | 'purpose';
  originalValue: string;
  editedValue: string;
  editedBy: string;
  editedAt: string | Timestamp;
}

export interface VersionCatalogOverlay {
  collection: 'contentCategories' | 'contentModules' | 'contentPages';
  kind: 'category' | 'module' | 'page';
  source?: string;
  slug: string;
  moduleSlug?: string;
  id?: number;
  isHidden?: boolean;
  isDeleted?: boolean;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt: string | Timestamp;
}

/**
 * Get version with full changelog (all content edits)
 */
export async function getVersionChangelog(
  versionIdOrKey: string
): Promise<QueryResult<VersionWithChangelog | null>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const cfgRes = await getVersionConfigDoc();
    if (!cfgRes.success || !cfgRes.data) {
      return { success: false, error: cfgRes.error || 'Failed to load version config' };
    }

    const cfg = cfgRes.data;
    const keyed = isKeyedConfig(cfg);

    // Get version info (resolves semantic -> key within the current epoch)
    const versionResult = await getVersion(versionIdOrKey);
    if (!versionResult.success || !versionResult.data) {
      return { success: false, error: versionResult.error || 'Version not found' };
    }

    const version = versionResult.data;
    const versionKey = version.versionKey;

    const editsRef = collection(firestore, 'contentEdits');
    const qEdits = keyed && versionKey
      ? query(editsRef, where('versionKey', '==', versionKey))
      : query(editsRef, where('versionId', '==', version.versionId));

    const snapshot = await getDocs(qEdits);

    const contentEdits: VersionContentEdit[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as any;
      contentEdits.push({
        pageId: data.pageId,
        moduleSlug: data.moduleSlug,
        pageSlug: data.pageSlug,
        field: data.field,
        originalValue: data.originalValue,
        editedValue: data.editedValue,
        editedBy: data.editedBy,
        editedAt: data.editedAt instanceof Timestamp ? data.editedAt.toDate().toISOString() : data.editedAt,
      });
    });

    contentEdits.sort((a, b) => {
      const timeA = typeof a.editedAt === 'string' ? new Date(a.editedAt).getTime() : 0;
      const timeB = typeof b.editedAt === 'string' ? new Date(b.editedAt).getTime() : 0;
      return timeB - timeA;
    });

    const [catsSnap, modsSnap, pagesSnap] = await Promise.all([
      keyed && versionKey
        ? getDocs(query(collection(firestore, 'contentCategories'), where('versionKey', '==', versionKey), where('status', '==', 'published')))
        : getDocs(query(collection(firestore, 'contentCategories'), where('versionId', '==', version.versionId), where('status', '==', 'published'))),
      keyed && versionKey
        ? getDocs(query(collection(firestore, 'contentModules'), where('versionKey', '==', versionKey), where('status', '==', 'published')))
        : getDocs(query(collection(firestore, 'contentModules'), where('versionId', '==', version.versionId), where('status', '==', 'published'))),
      keyed && versionKey
        ? getDocs(query(collection(firestore, 'contentPages'), where('versionKey', '==', versionKey), where('status', '==', 'published')))
        : getDocs(query(collection(firestore, 'contentPages'), where('versionId', '==', version.versionId), where('status', '==', 'published'))),
    ]);

    const overlays: VersionCatalogOverlay[] = [];

    const push = (collectionName: VersionCatalogOverlay['collection'], kind: VersionCatalogOverlay['kind'], d: any) => {
      overlays.push({
        collection: collectionName,
        kind,
        source: d.source,
        slug: d.slug,
        moduleSlug: d.moduleSlug,
        id: typeof d.id === 'number' ? d.id : undefined,
        isHidden: d.isHidden === true,
        isDeleted: d.isDeleted === true,
        updatedBy: d.updatedBy,
        updatedByName: d.updatedByName,
        updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate().toISOString() : d.updatedAt,
      });
    };

    catsSnap.forEach((docSnap) => push('contentCategories', 'category', docSnap.data()));
    modsSnap.forEach((docSnap) => push('contentModules', 'module', docSnap.data()));
    pagesSnap.forEach((docSnap) => push('contentPages', 'page', docSnap.data()));

    overlays.sort((a, b) => {
      const timeA = typeof a.updatedAt === 'string' ? new Date(a.updatedAt).getTime() : 0;
      const timeB = typeof b.updatedAt === 'string' ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

    return {
      success: true,
      data: {
        ...version,
        contentEdits,
        catalogOverlays: overlays,
      },
    };
  } catch (error) {
    console.error('Error getting version changelog:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get version changelog',
    };
  }
}

/**
 * Parse semantic version string
 */
export function parseSemanticVersion(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Increment version number
 */
export function incrementVersion(
  currentVersion: string,
  type: 'major' | 'minor' | 'patch'
): string {
  const parsed = parseSemanticVersion(currentVersion);
  if (!parsed) return '0.1.0';

  let { major, minor, patch } = parsed;

  switch (type) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
      patch += 1;
      break;
  }

  return `${major}.${minor}.${patch}`;
}

/**
 * Update the draft version in app config
 * This allows admins to change the version type (patch/minor/major) for draft changes
 */
export async function setDraftVersion(newDraftVersion: string): Promise<QueryResult<void>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    if (!parseSemanticVersion(newDraftVersion)) {
      return { success: false, error: 'Invalid semantic version format. Use X.Y.Z format.' };
    }

    const cfgRes = await getVersionConfigDoc();
    if (!cfgRes.success || !cfgRes.data) {
      return { success: false, error: cfgRes.error || 'Failed to load version config' };
    }

    const cfg = cfgRes.data;

    if (!isKeyedConfig(cfg)) {
      await setDoc(doc(firestore, 'appConfig', 'versionConfig'), { draftVersion: newDraftVersion }, { merge: true });
      return { success: true };
    }

    const draftKey = cfg.draftVersionKey!;

    // Update draft semantic version for the draft snapshot.
    await Promise.all([
      setDoc(doc(firestore, 'versions', draftKey), { versionId: newDraftVersion, updatedAt: serverTimestamp() }, { merge: true }),
      setDoc(doc(firestore, 'appConfig', 'versionConfig'), { draftVersion: newDraftVersion }, { merge: true }),
    ]);

    return { success: true };
  } catch (error) {
    console.error('Error setting draft version:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set draft version',
    };
  }
}

/**
 * Update draft version based on version type (patch/minor/major)
 * Calculates the new version based on current published version
 * Also updates all existing draft content edits to use the new version ID
 */
export async function updateDraftVersionType(
  versionType: 'major' | 'minor' | 'patch'
): Promise<QueryResult<string>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  const db = firestore;

  try {
    const cfgRes = await getVersionConfigDoc();
    if (!cfgRes.success || !cfgRes.data) {
      return { success: false, error: cfgRes.error || 'Failed to load version config' };
    }

    const cfg = cfgRes.data;

    // Keyed mode: don't rename docs; just update the semantic version label.
    if (isKeyedConfig(cfg)) {
      const currentVersion = cfg.currentVersion;
      const newDraftVersion = incrementVersion(currentVersion, versionType);

      if (cfg.draftVersion === newDraftVersion) {
        return { success: true, data: newDraftVersion };
      }

      const draftKey = cfg.draftVersionKey!;

      // Update the draft semantic version on the version record and config.
      await Promise.all([
        setDoc(doc(db, 'versions', draftKey), { versionId: newDraftVersion, updatedAt: serverTimestamp() }, { merge: true }),
        setDoc(doc(db, 'appConfig', 'versionConfig'), { draftVersion: newDraftVersion }, { merge: true }),
      ]);

      // Keep draft overlay docs and edits in sync (not required for querying, but keeps UI consistent).
      const updateEdits = async () => {
        const snap = await getDocs(
          query(collection(db, 'contentEdits'), where('versionKey', '==', draftKey), where('status', '==', 'active'))
        );
        await Promise.all(snap.docs.map((d) => setDoc(d.ref, { versionId: newDraftVersion }, { merge: true })));
      };

      const updateOverlayCollection = async (collectionName: 'contentCategories' | 'contentModules' | 'contentPages') => {
        const snap = await getDocs(
          query(collection(db, collectionName), where('versionKey', '==', draftKey), where('status', '==', 'active'))
        );
        await Promise.all(snap.docs.map((d) => setDoc(d.ref, { versionId: newDraftVersion }, { merge: true })));
      };

      await Promise.all([
        updateEdits(),
        updateOverlayCollection('contentCategories'),
        updateOverlayCollection('contentModules'),
        updateOverlayCollection('contentPages'),
      ]);

      return { success: true, data: newDraftVersion };
    }

    // Legacy mode
    const oldDraftVersionResult = await getDraftVersion();
    if (!oldDraftVersionResult.success || !oldDraftVersionResult.data) {
      return { success: false, error: 'Failed to get current draft version' };
    }
    const oldDraftVersion = oldDraftVersionResult.data;

    const currentVersionResult = await getCurrentVersion();
    if (!currentVersionResult.success || !currentVersionResult.data) {
      return { success: false, error: 'Failed to get current version' };
    }

    const currentVersion = currentVersionResult.data;
    const newDraftVersion = incrementVersion(currentVersion, versionType);

    if (oldDraftVersion === newDraftVersion) {
      return { success: true, data: newDraftVersion };
    }

    const editsRef = collection(db, 'contentEdits');
    const q = query(editsRef, where('versionId', '==', oldDraftVersion), where('status', '==', 'active'));
    const snapshot = await getDocs(q);

    const movePromises = snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data() as any;
      const pageId = data.pageId;
      const field = data.field;
      if (typeof pageId !== 'number' || (field !== 'title' && field !== 'content' && field !== 'purpose')) {
        await setDoc(docSnap.ref, { versionId: newDraftVersion }, { merge: true });
        return;
      }

      const newEditId = `${pageId}-${field}-${newDraftVersion}`;
      const newRef = doc(db, 'contentEdits', newEditId);

      await setDoc(
        newRef,
        {
          ...data,
          versionId: newDraftVersion,
          status: 'active',
        },
        { merge: true }
      );

      await setDoc(docSnap.ref, { status: 'archived' }, { merge: true });
    });

    await Promise.all(movePromises);

    const moveOverlayCollection = async (collectionName: 'contentCategories' | 'contentModules' | 'contentPages') => {
      const ref = collection(db, collectionName);
      const q = query(ref, where('versionId', '==', oldDraftVersion), where('status', '==', 'active'));
      const snap = await getDocs(q);

      await Promise.all(
        snap.docs.map(async (docSnap) => {
          const data = docSnap.data() as any;

          const oldId = docSnap.id;
          const newId = oldId.endsWith(`-${oldDraftVersion}`)
            ? oldId.slice(0, -(`-${oldDraftVersion}`.length)) + `-${newDraftVersion}`
            : doc(collection(db, collectionName)).id;

          const newRef = doc(db, collectionName, newId);

          await setDoc(
            newRef,
            {
              ...data,
              versionId: newDraftVersion,
              status: 'active',
            },
            { merge: true }
          );

          await setDoc(docSnap.ref, { status: 'archived' }, { merge: true });
        })
      );
    };

    await Promise.all([
      moveOverlayCollection('contentCategories'),
      moveOverlayCollection('contentModules'),
      moveOverlayCollection('contentPages'),
    ]);

    const updateResult = await setDraftVersion(newDraftVersion);
    if (!updateResult.success) {
      return { success: false, error: updateResult.error };
    }

    return { success: true, data: newDraftVersion };
  } catch (error) {
    console.error('Error updating draft version type:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update draft version type',
    };
  }
}
