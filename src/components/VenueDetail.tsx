"use client";

import { useState } from "react";
import { CommentsPanel } from "./CommentsPanel";
import { DealRow } from "./DealRow";
import { MapLink } from "./MapLink";
import { ReportSheet } from "./ReportSheet";
import type { DealDTO, VenueDTO } from "@/lib/types";

/**
 * Full venue view. Shows every deal expanded (including expired ones, which
 * are labelled rather than hidden) plus the comment thread.
 */
export function VenueDetail({ venue: initial }: { venue: VenueDTO }) {
  const [venue, setVenue] = useState(initial);
  const [reportTarget, setReportTarget] = useState<{ deal: DealDTO; venue: VenueDTO } | null>(null);

  const patchDeal = (dealId: string, patch: Partial<DealDTO>) =>
    setVenue((current) => ({
      ...current,
      deals: current.deals.map((deal) => (deal.id === dealId ? { ...deal, ...patch } : deal)),
    }));

  const active = venue.deals.filter((deal) => deal.status === "active");
  const past = venue.deals.filter((deal) => deal.status !== "active");

  return (
    <>
      <article className="pf-card mt-4 overflow-hidden">
        <header className="border-b border-rule p-5">
          <h1 className="wordmark text-2xl leading-tight">{venue.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            <MapLink
              name={venue.name}
              address1={venue.address1}
              city={venue.city}
              state={venue.state}
              postalCode={venue.postalCode}
              latitude={venue.latitude}
              longitude={venue.longitude}
              className="text-ink-soft"
            >
              {[venue.address1, venue.neighborhood, venue.city, venue.state, venue.postalCode]
                .filter(Boolean)
                .join(", ")}
            </MapLink>
          </p>

          {venue.status === "permanently_closed" && (
            <p className="mt-2 inline-block rounded bg-outdated-wash px-2 py-1 text-xs font-bold text-outdated">
              Permanently closed
            </p>
          )}
          {venue.status === "temporarily_closed" && (
            <p className="mt-2 inline-block rounded bg-stale-wash px-2 py-1 text-xs font-bold text-stale">
              Temporarily closed
            </p>
          )}
          {venue.notes && <p className="mt-2 text-xs italic text-ink-faint">{venue.notes}</p>}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <MapLink
              name={venue.name}
              address1={venue.address1}
              city={venue.city}
              state={venue.state}
              postalCode={venue.postalCode}
              latitude={venue.latitude}
              longitude={venue.longitude}
              className="font-semibold"
            >
              Directions
            </MapLink>
            {venue.website && (
              <a
                className="font-semibold underline underline-offset-2"
                href={venue.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                Website
              </a>
            )}
            {venue.phone && <a className="font-semibold underline underline-offset-2" href={`tel:${venue.phone}`}>{venue.phone}</a>}
          </div>
        </header>

        <div className="p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-faint">
            {active.length > 0 ? "Current deals" : "No current deals"}
          </h2>
          <ul className="divide-y divide-rule">
            {active.map((deal) => (
              <DealRow
                key={deal.id}
                deal={deal}
                onVerified={patchDeal}
                onReport={() => setReportTarget({ deal, venue })}
                expanded
              />
            ))}
          </ul>

          {past.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-ink-faint">
                Past deals ({past.length})
              </summary>
              {/* Expired deals are kept, never deleted - the history is the point. */}
              <ul className="mt-2 space-y-2 opacity-70">
                {past.map((deal) => (
                  <li key={deal.id} className="rounded-lg bg-paper-sunk px-3 py-2 text-sm">
                    <span className="font-semibold tabular-nums">
                      ${(deal.priceCents / 100).toFixed(2)}
                    </span>{" "}
                    {deal.beerName}
                    {deal.endedReason && (
                      <span className="block text-xs text-ink-faint">{deal.endedReason}</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="pf-perforation mt-5 pt-5">
            <CommentsPanel venue={venue} />
          </div>
        </div>
      </article>

      <ReportSheet
        open={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        target={reportTarget}
      />
    </>
  );
}
