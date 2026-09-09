/**
 * Client-side image and video processing, run before anything is uploaded.
 *
 * This has to happen in the browser, not on the server: uploads go directly
 * from the client to object storage via a presigned PUT, so the server never
 * sees the bytes and could not strip anything even if it wanted to.
 *
 * Three jobs, all done in one decode:
 *
 * 1. **Strip EXIF.** Phone photos carry GPS coordinates, timestamps and device
 *    identifiers, and these files are served publicly. Re-encoding through a
 *    canvas drops every metadata block, because the canvas only ever held
 *    pixels. This is the reason the whole module exists.
 * 2. **Bake in orientation.** EXIF also carries rotation, so stripping it
 *    naively turns half of all phone photos sideways. Decoding with
 *    `imageOrientation: "from-image"` applies the rotation to the pixels
 *    first, so the flattened result is upright.
 * 3. **Downscale and thumbnail.** A 12 MP phone photo is not needed to prove a
 *    beer costs $1, and the card carousel wants something far smaller still.
 *
 * If an image cannot be decoded we do **not** fall back to uploading it raw —
 * that would defeat the point. The upload is refused instead.
 */

export const MAX_LONG_EDGE = 1600;
export const THUMB_LONG_EDGE = 400;

export interface ProcessedImage {
  full: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  mimeType: string;
}

export class ImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

/** WebP is ~30% smaller than JPEG at equivalent quality and universally supported now. */
function outputType(): { mimeType: string; quality: number } {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    if (canvas.toDataURL("image/webp").startsWith("data:image/webp")) {
      return { mimeType: "image/webp", quality: 0.82 };
    }
  }
  return { mimeType: "image/jpeg", quality: 0.85 };
}

export async function processImage(file: File): Promise<ProcessedImage> {
  let bitmap: ImageBitmap;
  try {
    // "from-image" applies EXIF rotation during decode; the resulting pixels
    // are upright and carry no metadata of their own.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageProcessingError(
      "That image couldn't be read by your browser. HEIC often needs converting to JPEG first.",
    );
  }

  try {
    const { mimeType, quality } = outputType();
    const full = await render(bitmap, MAX_LONG_EDGE, mimeType, quality);
    const thumbnail = await render(bitmap, THUMB_LONG_EDGE, mimeType, quality);
    const scale = scaleFor(bitmap.width, bitmap.height, MAX_LONG_EDGE);

    return {
      full,
      thumbnail,
      width: Math.round(bitmap.width * scale),
      height: Math.round(bitmap.height * scale),
      mimeType,
    };
  } finally {
    bitmap.close();
  }
}

function scaleFor(width: number, height: number, longEdge: number): number {
  const longest = Math.max(width, height);
  return longest > longEdge ? longEdge / longest : 1;
}

async function render(
  bitmap: ImageBitmap,
  longEdge: number,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  const scale = scaleFor(bitmap.width, bitmap.height, longEdge);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageProcessingError("Your browser couldn't process that image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new ImageProcessingError("Couldn't re-encode that image.")),
      mimeType,
      quality,
    );
  });
}

/* ------------------------------------------------------------------ video */

export interface ProcessedVideo {
  poster: Blob | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

/**
 * Pulls a poster frame and dimensions from a video without uploading it.
 *
 * Video containers can carry location metadata too, but re-encoding video in
 * the browser is far too slow to do on upload. The poster is stripped by
 * virtue of coming off a canvas; the video itself is not, which is noted in
 * the UI so people can decide.
 */
export async function processVideo(file: File): Promise<ProcessedVideo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;

  try {
    const meta = await new Promise<{ duration: number; width: number; height: number } | null>(
      (resolve) => {
        const timer = window.setTimeout(() => resolve(null), 8000);
        video.addEventListener("loadedmetadata", () => {
          window.clearTimeout(timer);
          resolve({
            duration: Number.isFinite(video.duration) ? video.duration : 0,
            width: video.videoWidth,
            height: video.videoHeight,
          });
        });
        video.addEventListener("error", () => {
          window.clearTimeout(timer);
          resolve(null);
        });
        video.src = url;
      },
    );

    if (!meta) return { poster: null, width: null, height: null, durationSeconds: null };

    // A frame a second in avoids the black opening frame most clips start on.
    const poster = await captureFrame(video, Math.min(1, Math.max(0, meta.duration - 0.1)));
    const scale = scaleFor(meta.width, meta.height, THUMB_LONG_EDGE);

    return {
      poster,
      width: meta.width || null,
      height: meta.height || null,
      durationSeconds: meta.duration || null,
      ...(scale ? {} : {}),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function captureFrame(video: HTMLVideoElement, atSeconds: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 8000);

    const draw = () => {
      window.clearTimeout(timer);
      try {
        const scale = scaleFor(video.videoWidth, video.videoHeight, THUMB_LONG_EDGE);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8);
      } catch {
        resolve(null);
      }
    };

    video.addEventListener("seeked", draw, { once: true });
    video.addEventListener("error", () => {
      window.clearTimeout(timer);
      resolve(null);
    });
    try {
      video.currentTime = atSeconds;
    } catch {
      draw();
    }
  });
}
