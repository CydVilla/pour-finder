"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import type { ActivityItem, ActivityKind } from "@/server/activity";

const KIND_LABEL: Record<ActivityKind, string> = {
  deal: "Deal",
  venue: "New bar",
  media: "Photo/video",
  comment: "Comment",
};

const KIND_STYLE: Record<ActivityKind, string> = {
  deal: "bg-amber-wash text-amber-deep",
  venue: "bg-fresh-wash text-fresh",
  media: "bg-unknown-wash text-unknown",
  comment: "bg-paper-sunk text-ink-soft",
};

/**
 * What the public has added lately, newest first.
 *
 * With auto-approve on there is no queue to work through — this is the
 * after-the-fact review instead. Everything here is already live, so each row
 * needs the context to judge it at a glance and a one-click way to take it
 * down. Removal is reversible in spirit: deals are expired, bars closed and
 * comments hidden, all preserving the record.
 */
export function AdminActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [counts, setCounts] = useState<Record<ActivityKind, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<ActivityKind | "all">("all");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/activity?days=14");
      if (!response.ok) return;
      const data = (await response.json()) as {
        items: ActivityItem[];
        counts: Record<ActivityKind, number>;
      };
      setItems(data.items);
      setCounts(data.counts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (item: ActivityItem) => {
    const key = `${item.kind}:${item.id}`;
    setBusy((b) => ({ ...b, [key]: "…" }));
    try {
      const response = await fetch(`/api/admin/activity/${item.kind}/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove" }),
      });
      setBusy((b) => ({ ...b, [key]: response.ok ? "removed" : "failed" }));
      if (response.ok) {
        setItems((current) =>
          current.map((i) => (i.id === item.id && i.kind === item.kind ? { ...i, isLive: false } : i)),
        );
      }
    } catch {
      setBusy((b) => ({ ...b, [key]: "failed" }));
    }
  };

  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-faint">
        Recently added by the public
      </h2>
      <p className="mt-1 text-xs text-ink-soft">
        {counts
          ? `${total} in the last 7 days — ${counts.deal} deals, ${counts.venue} bars, ${counts.media} uploads, ${counts.comment} comments.`
          : "Loading…"}{" "}
        Everything here is already live. Removing keeps the record and the history.
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {(["all", "deal", "venue", "media", "comment"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className="pf-chip px-3 py-1.5 text-xs"
          >
            {k === "all" ? "Everything" : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-ink-soft">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          Nothing in the last 14 days. Once people start contributing it shows up here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shown.map((item) => {
            const key = `${item.kind}:${item.id}`;
            return (
              <li
                key={key}
                className={clsx("pf-card p-3", !item.isLive && "opacity-55")}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={clsx("rounded px-1.5 py-0.5 font-bold", KIND_STYLE[item.kind])}>
                    {KIND_LABEL[item.kind]}
                  </span>
                  {item.venueName && (
                    <a
                      href={item.venueSlug ? `/venue/${item.venueSlug}` : "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-ink underline underline-offset-2"
                    >
                      {item.venueName}
                    </a>
                  )}
                  <time className="ml-auto text-ink-faint" dateTime={item.createdAt}>
                    {relative(item.createdAt)}
                  </time>
                </div>

                <p className="mt-1.5 font-semibold text-ink">{item.title}</p>
                {item.detail && (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink-soft">
                    {item.detail}
                  </p>
                )}
                {item.mediaUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.mediaUrl}
                    alt="Recently uploaded, awaiting review"
                    className="mt-2 h-36 rounded-lg bg-paper-sunk object-contain"
                    loading="lazy"
                  />
                )}

                <div className="mt-2 flex items-center gap-2">
                  {item.isLive ? (
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      disabled={Boolean(busy[key])}
                      className="pf-button pf-button-quiet px-3 py-1.5 text-sm"
                    >
                      {item.kind === "media" ? "Delete" : "Take down"}
                    </button>
                  ) : (
                    <span className="text-sm font-semibold text-outdated">
                      {item.kind === "media" ? "Deleted" : "Taken down"}
                    </span>
                  )}
                  {busy[key] === "failed" && (
                    <span className="text-sm font-semibold text-outdated">failed</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function relative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
