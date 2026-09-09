"use client";

import { useRef, useState } from "react";
import type { MediaPurpose } from "@/db/schema";
import { MEDIA_LIMITS, formatBytes, kindForMimeType } from "@/lib/media-limits";
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

type State = "idle" | "checking" | "uploading" | "done" | "error";

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
    setState("checking");

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

    if (kind === "video") {
      const duration = await readVideoDuration(file);
      if (duration !== null && duration > MEDIA_LIMITS.video.maxDurationSeconds) {
        setState("error");
        setMessage(
          `That clip is ${Math.round(duration)}s — please keep it under ${
            MEDIA_LIMITS.video.maxDurationSeconds
          }s.`,
        );
        return;
      }
    }

    try {
      const ticketResponse = await fetch("/api/media/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          dealId: dealId ?? undefined,
          purpose,
          mimeType: file.type,
          sizeBytes: file.size,
          assertedPriceCents:
            purpose === "price_evidence" ? (parseDollarsToCents(price) ?? undefined) : undefined,
        }),
      });

      const ticket = (await ticketResponse.json()) as
        | { mediaId: string; uploadUrl: string }
        | { error: string };

      if (!ticketResponse.ok || "error" in ticket) {
        setState("error");
        setMessage("error" in ticket ? ticket.error : "Couldn't start the upload.");
        return;
      }

      setState("uploading");
      await putWithProgress(ticket.uploadUrl, file, setProgress);

      const confirmResponse = await fetch(`/api/media/${ticket.mediaId}/confirm`, {
        method: "POST",
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
        disabled={state === "uploading" || state === "checking"}
        className="pf-button pf-button-quiet w-full px-4 py-2.5 text-sm"
      >
        {state === "uploading"
          ? `Uploading… ${progress}%`
          : state === "checking"
            ? "Checking…"
            : label}
      </button>

      {hint && state === "idle" && <p className="text-xs text-ink-faint">{hint}</p>}

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
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)),
    );
    xhr.addEventListener("error", () => reject(new Error("network")));
    xhr.send(file);
  });
}

/** Reads duration from decoded metadata without uploading anything. */
function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.addEventListener("loadedmetadata", () =>
      done(Number.isFinite(video.duration) ? video.duration : null),
    );
    video.addEventListener("error", () => done(null));
    video.src = url;
    window.setTimeout(() => done(null), 5000);
  });
}
