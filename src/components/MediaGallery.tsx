"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import type { MediaDTO } from "@/server/media";
import { MediaUploader } from "./MediaUploader";

interface Props {
  venueId: string;
  venueName: string;
  /** Restricts the gallery and the uploader to one medium. */
  kind?: "photo" | "video";
  title: string;
  emptyPrompt: string;
  uploadLabel: string;
  purpose: "price_evidence" | "menu" | "pour" | "venue";
  dealId?: string | null;
}

/**
 * Photos and videos for a venue, with the uploader inline.
 *
 * Media is lazy-loaded on mount rather than shipped with the venue payload:
 * most cards are never expanded, and the discovery response is already the
 * hot path.
 */
export function MediaGallery({
  venueId,
  venueName,
  kind,
  title,
  emptyPrompt,
  uploadLabel,
  purpose,
  dealId,
}: Props) {
  const [items, setItems] = useState<MediaDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ venueId });
      if (kind) params.set("kind", kind);
      const response = await fetch(`/api/media?${params}`);
      if (!response.ok) return;
      const data = (await response.json()) as { media: MediaDTO[] };
      setItems(data.media);
    } catch {
      /* offline; the rest of the card still works */
    } finally {
      setLoading(false);
    }
  }, [venueId, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  // Hide the uploader entirely when storage isn't configured, rather than
  // letting someone pick a file and then fail.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/media/status")
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d: { configured?: boolean }) => {
        if (!cancelled) setAvailable(Boolean(d.configured));
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-faint">{title}</h3>

      {items.length > 0 && (
        <ul className="pf-scroll-x flex gap-2 pb-1">
          {items.map((item) => (
            <li key={item.id} className="shrink-0">
              <figure className="w-40">
                {item.kind === "video" ? (
                  <video
                    className="h-28 w-40 rounded-lg bg-paper-sunk object-cover"
                    src={item.url}
                    poster={item.thumbnailUrl ?? undefined}
                    controls
                    playsInline
                    preload="none"
                    aria-label={item.caption ?? `Video at ${venueName}`}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="h-28 w-40 rounded-lg bg-paper-sunk object-cover"
                    // Thumbnail when we have one: the full image is up to
                    // 1600px and this box is 160px wide.
                    src={item.thumbnailUrl ?? item.url}
                    alt={
                      item.caption ??
                      (item.purpose === "price_evidence" || item.purpose === "menu"
                        ? `Menu or price evidence at ${venueName}`
                        : `Photo at ${venueName}`)
                    }
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <figcaption className="mt-1 text-[11px] leading-tight text-ink-faint">
                  {item.assertedPriceCents !== null && (
                    <span className="font-semibold text-ink">
                      {formatCents(item.assertedPriceCents)}{" "}
                    </span>
                  )}
                  {item.caption ?? ""}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}

      {!loading && items.length === 0 && <p className="text-xs text-ink-faint">{emptyPrompt}</p>}

      {available && (
        <MediaUploader
          venueId={venueId}
          dealId={dealId}
          purpose={purpose}
          accept={kind ?? "both"}
          label={uploadLabel}
          hint={
            purpose === "price_evidence"
              ? "A photo of the menu or the board is the strongest proof a price is real."
              : undefined
          }
          onUploaded={load}
        />
      )}
    </section>
  );
}
