"use client";

import { useRef, useState } from "react";
import type { MediaPurpose } from "@/db/schema";
import { MEDIA_LIMITS, formatBytes, kindForMimeType } from "@/lib/media-limits";
import {
  ImageProcessingError,
  processImage,
  processVideo,
} from "@/lib/image-processing";
import { parseDollarsToCents } from "@/lib/money";

interface Props {
  venueId: string;
  dealId?: string | null;
  /** "price_evidence" asks for the price shown; "pour" is a plain share. */
  purpose: MediaPurpose;
  accept: "photo" | "video" | "both";
  label: string;
  hint?: string;
  onUploaded?: () => void;
}

type State = "idle" | "processing" | "uploading" | "done" | "error";

/**
 * Direct-to-storage uploader.
 *
 * Validates locally first — type, size, and for video the actual duration read
 * from the decoded metadata — because the alternative is letting someone push
 * 40 MB over a phone connection only to be rejected at the end. The server
 * re-checks everything regardless; this is courtesy, not security.
 */
export function MediaUploader({
  venueId,
  dealId,
  purpose,
  accept,
  label,
  hint,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [price, setPrice] = useState("");

  const acceptAttr =
    accept === "photo"
      ? MEDIA_LIMITS.photo.mimeTypes.join(",")
      : accept === "video"
        ? MEDIA_LIMITS.video.mimeTypes.join(",")
        : [...MEDIA_LIMITS.photo.mimeTypes, ...MEDIA_LIMITS.video.mimeTypes].join(",");

  const handle = async (file: File) => {
    setMessage(null);
    setProgress(0);

    const kind = kindForMimeType(file.type);
    if (!kind || (accept !== "both" && kind !== accept)) {
      setState("error");
      setMessage(`That's not a supported ${accept === "both" ? "file" : accept}.`);
      return;
    }

    const limits = MEDIA_LIMITS[kind];
    if (file.size > limits.maxBytes) {
      setState("error");
      setMessage(`Too big — ${formatBytes(file.size)}, and the limit is ${formatBytes(limits.maxBytes)}.`);
      return;
    }

    // Everything below happens before a single byte leaves the device.
    setState("processing");

    let body: Blob = file;
    let bodyType = file.type;
    let thumbnail: Blob | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let durationSeconds: number | null = null;

    if (kind === "photo") {
      try {
        // Re-encoding through a canvas is what removes EXIF — including the
        // GPS coordinates most phones write into every photo. These files are
        // served publicly, so we refuse rather than upload an unprocessed one.
        const processed = await processImage(file);
        body = processed.full;
        bodyType = processed.mimeType;
        thumbnail = processed.thumbnail;
        width = processed.width;
        height = processed.height;
      } catch (error) {
        setState("error");
        setMessage(
          error instanceof ImageProcessingError
            ? error.message
            : "That image couldn't be processed.",
        );
        return;
      }
    } else {
      const processed = await processVideo(file);
      if (
        processed.durationSeconds !== null &&
        processed.durationSeconds > MEDIA_LIMITS.video.maxDurationSeconds
      ) {
        setState("error");
        setMessage(
          `That clip is ${Math.round(processed.durationSeconds)}s — please keep it under ${
            MEDIA_LIMITS.video.maxDurationSeconds
          }s.`,
        );
        return;
      }
      thumbnail = processed.poster;
      width = processed.width;
      height = processed.height;
      durationSeconds = processed.durationSeconds;
    }

    try {
      const ticketResponse = await fetch("/api/media/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          dealId: dealId ?? undefined,
          purpose,
          mimeType: bodyType,
          sizeBytes: body.size,
          thumbnailMimeType: thumbnail ? thumbnail.type : undefined,
          thumbnailSizeBytes: thumbnail ? thumbnail.size : undefined,
          width: width ?? undefined,
          height: height ?? undefined,
          durationSeconds: durationSeconds ?? undefined,
          assertedPriceCents:
            purpose === "price_evidence" ? (parseDollarsToCents(price) ?? undefined) : undefined,
        }),
      });

      const ticket = (await ticketResponse.json()) as
        | {
            mediaId: string;
            uploadUrl: string;
            thumbnailUploadUrl?: string | null;
            reportUrl?: boolean;
          }
        | { error: string };

      if (!ticketResponse.ok || "error" in ticket) {
        setState("error");
        setMessage("error" in ticket ? ticket.error : "Couldn't start the upload.");
        return;
      }

      setState("uploading");
      const uploadResponse = await putWithProgress(ticket.uploadUrl, body, bodyType, setProgress);

      // Thumbnails are a nicety; a failure here must not lose the upload.
      let thumbResponse: string | null = null;
      if (thumbnail && ticket.thumbnailUploadUrl) {
        try {
          thumbResponse = await putWithProgress(
            ticket.thumbnailUploadUrl,
            thumbnail,
            thumbnail.type,
            () => undefined,
          );
        } catch {
          thumbResponse = null;
        }
      }

      // Vercel Blob returns the final URL in the PUT response; S3 does not
      // need one because the URL is derivable from the key.
      let resolvedUrl: string | null = null;
      let resolvedThumbUrl: string | null = null;
      if (ticket.reportUrl) {
        resolvedUrl = urlFromResponse(uploadResponse);
        resolvedThumbUrl = thumbResponse ? urlFromResponse(thumbResponse) : null;
      }

      const confirmResponse = await fetch(`/api/media/${ticket.mediaId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: resolvedUrl, thumbnailUrl: resolvedThumbUrl }),
      });
      const confirmed = (await confirmResponse.json()) as { message?: string; error?: string };

      if (!confirmResponse.ok) {
        setState("error");
        setMessage(confirmed.error ?? "Upload finished but couldn't be saved.");
        return;
      }

      setState("done");
      setMessage(confirmed.message ?? "Thanks!");
      setPrice("");
      onUploaded?.();
    } catch {
      setState("error");
      setMessage("Upload failed. Try again?");
    }
  };

  if (state === "done") {
    return (
      <p role="status" className="text-xs font-medium text-fresh">
        {message}{" "}
        <button
          type="button"
          onClick={() => {
            setState("idle");
            setMessage(null);
          }}
          className="underline underline-offset-2"
        >
          Add another
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {purpose === "price_evidence" && (
        <div className="relative">
          <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-ink-faint">
            $
          </span>
          <input
            className="pf-input pl-7 tabular-nums"
            inputMode="decimal"
            placeholder="Price shown in the photo (optional)"
            aria-label="Price shown in the photo"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handle(file);
          event.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={state === "uploading" || state === "processing"}
        className="pf-button pf-button-quiet w-full px-4 py-2.5 text-sm"
      >
        {state === "uploading"
          ? `Uploading… ${progress}%`
          : state === "processing"
            ? "Preparing…"
            : label}
      </button>

      {hint && state === "idle" && <p className="text-xs text-ink-faint">{hint}</p>}
      {state === "idle" && (
        <p className="text-xs text-ink-faint">
          {accept === "video"
            ? "Location data is not removed from video files — check your clip before sharing."
            : "Location data is removed from photos before they leave your device."}
        </p>
      )}

      {state === "uploading" && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-paper-sunk"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-amber transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {message && state === "error" && (
        <p role="alert" className="text-xs font-medium text-outdated">
          {message}
        </p>
      )}
    </div>
  );
}

/** XHR rather than fetch, because fetch still can't report upload progress. */
function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.responseText)
        : reject(new Error(`HTTP ${xhr.status}`)),
    );
    xhr.addEventListener("error", () => reject(new Error("network")));
    xhr.send(body);
  });
}

/** Vercel Blob returns the stored object's URL in the PUT response body. */
function urlFromResponse(response: string): string | null {
  try {
    const parsed = JSON.parse(response) as { url?: string };
    return parsed.url ?? null;
  } catch {
    return null;
  }
}
