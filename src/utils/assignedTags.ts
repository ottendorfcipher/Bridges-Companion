import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  setDoc,
} from 'firebase/firestore';
import { firestore } from '@config/firebase';
import type { QueryResult } from '@/types/database';

export interface AssignedTag {
  id: string;
  name: string;
  color: string; // hex (e.g. #007AFF)
  memberUserIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignedSection {
  sectionId: number;
  sectionTitle: string;
  categorySlug: string;
  assignedBy: {
    uid: string;
    email: string | null;
    displayName: string | null;
  };
  assignedAt: string;
}

function toIso(ts: Timestamp | string | undefined | null): string {
  if (!ts) return new Date(0).toISOString();
  return ts instanceof Timestamp ? ts.toDate().toISOString() : ts;
}

function tagsCollection() {
  if (!firestore) return null;
  return collection(firestore, 'assignedTags');
}

export async function getAllAssignedTags(): Promise<QueryResult<AssignedTag[]>> {
  const tagsRef = tagsCollection();
  if (!tagsRef) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const snapshot = await getDocs(tagsRef);
    const tags: AssignedTag[] = snapshot.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        name: String(data.name || ''),
        color: String(data.color || '#007AFF'),
        memberUserIds: Array.isArray(data.memberUserIds) ? data.memberUserIds : [],
        createdBy: String(data.createdBy || ''),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    // Stable UX: sort locally to avoid needing Firestore composite indexes.
    tags.sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, data: tags };
  } catch (error) {
    console.error('Error fetching assigned tags:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch assigned tags',
    };
  }
}

export async function getAssignedTagsForUser(userId: string): Promise<QueryResult<AssignedTag[]>> {
  const tagsRef = tagsCollection();
  if (!tagsRef) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const q = query(tagsRef, where('memberUserIds', 'array-contains', userId));
    const snapshot = await getDocs(q);

    const tags: AssignedTag[] = snapshot.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        name: String(data.name || ''),
        color: String(data.color || '#007AFF'),
        memberUserIds: Array.isArray(data.memberUserIds) ? data.memberUserIds : [],
        createdBy: String(data.createdBy || ''),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    tags.sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, data: tags };
  } catch (error) {
    console.error('Error fetching assigned tags for user:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch assigned tags',
    };
  }
}

export async function createAssignedTag(options: {
  name: string;
  color: string;
  memberUserIds: string[];
  createdBy: string;
}): Promise<QueryResult<{ id: string }>> {
  const tagsRef = tagsCollection();
  if (!tagsRef) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const docRef = await addDoc(tagsRef, {
      name: options.name,
      color: options.color,
      memberUserIds: options.memberUserIds,
      createdBy: options.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { success: true, data: { id: docRef.id } };
  } catch (error) {
    console.error('Error creating assigned tag:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create assigned tag',
    };
  }
}

export async function updateAssignedTag(
  tagId: string,
  updates: Partial<Pick<AssignedTag, 'name' | 'color' | 'memberUserIds'>>
): Promise<QueryResult<void>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    await updateDoc(doc(firestore, 'assignedTags', tagId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating assigned tag:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update assigned tag',
    };
  }
}

export async function deleteAssignedTagAndSections(tagId: string): Promise<QueryResult<void>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    // Best-effort: delete subcollection docs first so we don't leave orphaned data.
    const sectionsRef = collection(firestore, 'assignedTags', tagId, 'sections');
    const snapshot = await getDocs(sectionsRef);
    await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));

    await deleteDoc(doc(firestore, 'assignedTags', tagId));

    return { success: true };
  } catch (error) {
    console.error('Error deleting assigned tag:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete assigned tag',
    };
  }
}

export async function getAssignedSectionsForTag(tagId: string): Promise<QueryResult<AssignedSection[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const sectionsRef = collection(firestore, 'assignedTags', tagId, 'sections');
    const q = query(sectionsRef, orderBy('assignedAt', 'desc'));
    const snapshot = await getDocs(q);

    const sections: AssignedSection[] = snapshot.docs.map((d) => {
      const data = d.data() as any;
      return {
        sectionId: Number(data.sectionId),
        sectionTitle: String(data.sectionTitle || ''),
        categorySlug: String(data.categorySlug || ''),
        assignedBy: {
          uid: String(data.assignedBy?.uid || ''),
          email: data.assignedBy?.email ?? null,
          displayName: data.assignedBy?.displayName ?? null,
        },
        assignedAt: toIso(data.assignedAt),
      };
    });

    return { success: true, data: sections };
  } catch (error) {
    console.error('Error fetching assigned sections for tag:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch assigned sections',
    };
  }
}

export async function isSectionAssignedToTag(tagId: string, sectionId: number): Promise<QueryResult<boolean>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const ref = doc(firestore, 'assignedTags', tagId, 'sections', String(sectionId));
    const snapshot = await getDoc(ref);
    return { success: true, data: snapshot.exists() };
  } catch (error) {
    console.error('Error checking tag assignment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check assignment',
    };
  }
}

export async function assignSectionToTag(options: {
  tagId: string;
  sectionId: number;
  sectionTitle: string;
  categorySlug: string;
  assignedBy: { uid: string; email: string | null; displayName: string | null };
}): Promise<QueryResult<void>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const ref = doc(firestore, 'assignedTags', options.tagId, 'sections', String(options.sectionId));
    await setDoc(
      ref,
      {
        sectionId: options.sectionId,
        sectionTitle: options.sectionTitle,
        categorySlug: options.categorySlug,
        assignedBy: options.assignedBy,
        assignedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('Error assigning section to tag:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to assign section',
    };
  }
}

export async function removeSectionFromTag(options: {
  tagId: string;
  sectionId: number;
}): Promise<QueryResult<void>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    await deleteDoc(doc(firestore, 'assignedTags', options.tagId, 'sections', String(options.sectionId)));
    return { success: true };
  } catch (error) {
    console.error('Error removing section from tag:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove assignment',
    };
  }
}
