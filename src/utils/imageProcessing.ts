export const ICON_NORMALIZE_SIZE_PX = 256;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export type NormalizeMode = 'contain' | 'cover';

export interface NormalizeImageOptions {
  sizePx?: number;
  mode?: NormalizeMode;
  maxUploadBytes?: number;
}

export interface NormalizedImageResult {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function decodeToBitmap(file: File): Promise<{ bitmap: ImageBitmap; revoke: () => void }> {
  // Preferred path: createImageBitmap
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    return { bitmap, revoke: () => bitmap.close() };
  }

  // Fallback path: HTMLImageElement
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to decode image'));
  });

  // Use a canvas to convert to ImageBitmap-like object.
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error('Canvas not supported');
  }

  ctx.drawImage(img, 0, 0);

  const bitmap = await createImageBitmap(canvas);
  URL.revokeObjectURL(url);

  return { bitmap, revoke: () => bitmap.close() };
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });

  if (!blob) {
    throw new Error('Failed to encode PNG');
  }

  return blob;
}

/**
 * Normalize an image file to a square PNG (default 256×256).
 * - Validates input size
 * - Resizes client-side
 * - Outputs PNG for consistent rendering
 */
export async function normalizeImageToSquarePng(
  file: File,
  options: NormalizeImageOptions = {}
): Promise<NormalizedImageResult> {
  const sizePx = options.sizePx ?? ICON_NORMALIZE_SIZE_PX;
  const mode: NormalizeMode = options.mode ?? 'contain';
  const maxUploadBytes = options.maxUploadBytes ?? MAX_UPLOAD_BYTES;

  if (file.size > maxUploadBytes) {
    throw new Error(`File is too large. Max is ${Math.floor(maxUploadBytes / (1024 * 1024))} MB.`);
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Unsupported file type. Please upload an image.');
  }

  const { bitmap, revoke } = await decodeToBitmap(file);

  try {
    const srcW = Math.max(1, bitmap.width);
    const srcH = Math.max(1, bitmap.height);

    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not supported');
    }

    // Transparent background (good for icons)
    ctx.clearRect(0, 0, sizePx, sizePx);

    // Choose scaling strategy
    const scaleContain = Math.min(sizePx / srcW, sizePx / srcH);
    const scaleCover = Math.max(sizePx / srcW, sizePx / srcH);
    const scale = mode === 'cover' ? scaleCover : scaleContain;

    const drawW = srcW * scale;
    const drawH = srcH * scale;

    const dx = (sizePx - drawW) / 2;
    const dy = (sizePx - drawH) / 2;

    // Avoid fractional blurring for very small icons, but keep it simple.
    const ndx = clampNumber(dx, -sizePx, sizePx);
    const ndy = clampNumber(dy, -sizePx, sizePx);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, ndx, ndy, drawW, drawH);

    const blob = await canvasToPngBlob(canvas);

    return {
      blob,
      width: sizePx,
      height: sizePx,
      bytes: blob.size,
    };
  } finally {
    revoke();
  }
}
