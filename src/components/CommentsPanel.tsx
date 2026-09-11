"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import type { CommentSignal } from "@/db/schema";
import { formatCents, parseDollarsToCents } from "@/lib/money";
import type { CommentDTO } from "@/server/comments";
import type { DealDTO, VenueDTO } from "@/lib/types";

interface Props {
  venue: VenueDTO;
  /** When set, the comment is attached to this specific deal. */
  deal?: DealDTO | null;
}

/**
 * Venue comments, in the spirit of PlugShare check-ins.
 *
 * The status selector is the important part: "is it still there?" is captured
 * as structured data rather than inferred from prose, because that signal is
 * what drives escalation, and guessing it wrong means delisting a real deal.
 */
const SIGNAL_OPTIONS: { id: CommentSignal; label: string; tone: "good" | "bad" | "neutral" }[] = [
  { id: "still_good", label: "Still there", tone: "good" },
  { id: "price_changed", label: "Price changed", tone: "bad" },
  { id: "no_longer_available", label: "Deal is gone", tone: "bad" },
  { id: "venue_closed", label: "Bar has closed", tone: "bad" },
  { id: "none", label: "Just a note", tone: "neutral" },
];

const SIGNAL_BADGE: Record<CommentSignal, { label: string; className: string } | null> = {
  still_good: { label: "Still there", className: "bg-fresh-wash text-fresh" },
  price_changed: { label: "Price changed", className: "bg-stale-wash text-stale" },
  no_longer_available: { label: "Gone", className: "bg-outdated-wash text-outdated" },
  venue_closed: { label: "Bar closed", className: "bg-outdated-wash text-outdated" },
  none: null,
};

export function CommentsPanel({ venue, deal }: Props) {
  const [items, setItems] = useState<CommentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [signal, setSignal] = useState<CommentSignal>("still_good");
  const [price, setPrice] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ venueId: venue.id });
      if (deal) params.set("dealId", deal.id);
      const response = await fetch(`/api/comments?${params}`);
      if (!response.ok) return;
      const data = (await response.json()) as { comments: CommentDTO[] };
      setItems(data.comments);
    } catch {
      /* offline; the rest of the card still works */
    } finally {
      setLoading(false);
    }
  }, [venue.id, deal]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const trimmed = body.trim();
    if (trimmed.length < 2) {
      setError("Add a few words so the note is useful.");
      return;
    }
    setSending(true);
    setError(null);

    try {
      const reportedPriceCents = signal === "price_changed" ? parseDollarsToCents(price) : null;
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: venue.id,
          dealId: deal?.id,
          body: trimmed,
          signal,
          reportedPriceCents: reportedPriceCents ?? undefined,
          displayName: name.trim() || undefined,
        }),
      });

      const data = (await response.json()) as
        | { comment: CommentDTO; escalated: boolean; message: string }
        | { error: string; fieldErrors?: Record<string, string[]> };

      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "Couldn't post that.");
        return;
      }

      setItems((current) => [data.comment, ...current]);
      setBody("");
      setPrice("");
      setNotice(data.message);
    } catch {
      setError("Couldn't reach the server. Try again?");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-faint">
        {deal ? "Comments on this deal" : "Comments"}
      </h3>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What's the status?">
          {SIGNAL_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={signal === option.id}
              data-active={signal === option.id ? "true" : undefined}
              onClick={() => setSignal(option.id)}
              className="pf-chip min-h-9 px-3 py-1.5 text-xs"
            >
              {option.label}
            </button>
          ))}
        </div>

        {signal === "price_changed" && (
          <div className="relative">
            <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-ink-faint">
              $
            </span>
            <input
              className="pf-input pl-7 tabular-nums"
              inputMode="decimal"
              placeholder="What is it now?"
              aria-label="New price in dollars"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>
        )}

        <textarea
          rows={2}
          className="pf-input resize-none"
          placeholder={
            signal === "still_good"
              ? "Was there tonight, still $1…"
              : "What did you find?"
          }
          aria-label="Your comment"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={1000}
        />

        <div className="flex items-center gap-2">
          <input
            className="pf-input flex-1"
            placeholder="Name (optional)"
            aria-label="Display name, optional"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
          />
          <button
            type="button"
            onClick={submit}
            disabled={sending}
            className="pf-button pf-button-primary shrink-0 px-4 py-2.5 text-sm"
          >
            {sending ? "Posting…" : "Post"}
          </button>
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-outdated">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-xs text-ink-soft">
            {notice}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-ink-faint">Loading comments…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-faint">
          No comments yet. If you&apos;ve been recently, a one-line note helps everyone.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((comment) => {
            const badge = SIGNAL_BADGE[comment.signal];
            return (
              <li key={comment.id} className="rounded-lg bg-paper-sunk px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-ink">
                    {comment.displayName || "Anonymous"}
                    {comment.isMine && <span className="ml-1 text-ink-faint">(you)</span>}
                  </span>
                  {badge && (
                    <span className={clsx("rounded px-1.5 py-0.5 font-semibold", badge.className)}>
                      {badge.label}
                    </span>
                  )}
                  {comment.reportedPriceCents !== null && (
                    <span className="font-semibold text-ink-soft tabular-nums">
                      now {formatCents(comment.reportedPriceCents)}
                    </span>
                  )}
                  <time
                    className="ml-auto text-ink-faint"
                    dateTime={comment.createdAt}
                    suppressHydrationWarning
                  >
                    {relativeDay(comment.createdAt)}
                  </time>
                </div>
                {/* Rendered as text, never as markup: this is untrusted input. */}
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">
                  {comment.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
