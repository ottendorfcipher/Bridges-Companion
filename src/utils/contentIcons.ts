import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { firestore, storage } from '@config/firebase';
import type { QueryResult } from '@/types/database';
import { normalizeImageToSquarePng, ICON_NORMALIZE_SIZE_PX, MAX_UPLOAD_BYTES } from '@utils/imageProcessing';

export interface ContentIcon {
  iconId: string;
  storagePath: string;
  downloadUrl: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string | Timestamp;
  createdBy: string;
  createdByName: string;
}

export async function uploadContentIcon(
  file: File,
  user: { uid: string; displayName?: string | null; email?: string | null }
): Promise<QueryResult<ContentIcon>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }
  if (!storage) {
    return { success: false, error: 'Storage is not initialized' };
  }

  try {
    if (file.size > MAX_UPLOAD_BYTES) {
      return { success: false, error: 'File is too large (max 10 MB).' };
    }

    const iconsCol = collection(firestore, 'contentIcons');
    const iconId = doc(iconsCol).id;

    const normalized = await normalizeImageToSquarePng(file, {
      sizePx: ICON_NORMALIZE_SIZE_PX,
      maxUploadBytes: MAX_UPLOAD_BYTES,
      mode: 'contain',
    });

    const storagePath = `content-icons/${iconId}.png`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, normalized.blob, {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    });

    const downloadUrl = await getDownloadURL(storageRef);

    const iconDoc: Omit<ContentIcon, 'createdAt'> & { createdAt: any } = {
      iconId,
      storagePath,
      downloadUrl,
      width: normalized.width,
      height: normalized.height,
      bytes: normalized.bytes,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      createdByName: user.displayName || user.email || 'Unknown User',
    };

    await setDoc(doc(firestore, 'contentIcons', iconId), iconDoc);

    return { success: true, data: iconDoc as ContentIcon };
  } catch (error) {
    console.error('Error uploading content icon:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload icon',
    };
  }
}

export async function listContentIcons(): Promise<QueryResult<ContentIcon[]>> {
  if (!firestore) {
    return { success: false, error: 'Firestore is not initialized' };
  }

  try {
    const iconsRef = collection(firestore, 'contentIcons');
    const q = query(iconsRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);

    const icons: ContentIcon[] = [];
    snap.forEach((d) => icons.push(d.data() as ContentIcon));

    return { success: true, data: icons };
  } catch (error) {
    console.error('Error listing content icons:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list icons',
    };
  }
}
