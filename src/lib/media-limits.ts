/**
 * Upload limits, shared by the client (to reject early, before a long upload)
 * and the server (which is the one that actually enforces them).
 *
 * Video limits are deliberately tight. R2 storage is free to 10 GB and egress
 * is free, but neither is infinite, and a "share your pint" clip does not need
 * to be a two-minute 4K file. A 30-second cap at 40 MB is roughly 250 clips
 * per gigabyte.
 */
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

export const MEDIA_LIMITS = {
  photo: {
    maxBytes: 8 * 1024 * 1024,
    mimeTypes: PHOTO_MIME_TYPES as readonly string[],
    label: "photo",
    hint: "JPEG, PNG, WebP or HEIC, up to 8 MB",
  },
  video: {
    maxBytes: 40 * 1024 * 1024,
    maxDurationSeconds: 30,
    mimeTypes: VIDEO_MIME_TYPES as readonly string[],
    label: "video",
    hint: "MP4, MOV or WebM, up to 30 seconds and 40 MB",
  },
} as const;

export type MediaKindKey = keyof typeof MEDIA_LIMITS;

export function kindForMimeType(mimeType: string): MediaKindKey | null {
  if ((PHOTO_MIME_TYPES as readonly string[]).includes(mimeType)) return "photo";
  if ((VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) return "video";
  return null;
}

export function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  return map[mimeType] ?? "bin";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
