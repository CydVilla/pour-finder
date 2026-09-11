"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { formatDistance, formatServingDescription, pluralize } from "@/lib/format";
import { freshnessHint } from "@/lib/freshness";
import { formatCents, formatPricePerOunce } from "@/lib/money";
import type { DealDTO, VenueDTO } from "@/lib/types";
import { CommentsPanel } from "./CommentsPanel";
import { MapLink } from "./MapLink";
import { MediaGallery } from "./MediaGallery";
import { DealRow } from "./DealRow";
import { FreshnessBadge } from "./FreshnessBadge";
import { PriceBlock } from "./PriceBlock";
import { VerifyControls } from "./VerifyControls";

interface Props {
  venue: VenueDTO;
  isSelected: boolean;
  onSelect: (venueId: string) => void;
  onVerified: (dealId: string, patch: Partial<DealDTO>) => void;
  onReport: (deal: DealDTO, venue: VenueDTO) => void;
}

/**
 * A venue result. Compact by default: everything needed to decide whether to
 * walk there, and nothing else. The extra deals and the confirm/report
 * controls live one tap away, so the scan stays fast.
 */
export function VenueCard({ venue, isSelected, onSelect, onVerified, onReport }: Props) {
  const [expanded, setExpanded] = useState(false);

  const headline = venue.deals[0];
  const others = venue.deals.slice(1);
  const distance = formatDistance(venue.distanceMeters);
  const hint = freshnessHint(venue.bestFreshness, headline?.daysSinceVerified ?? null);
  const perOunce = headline ? formatPricePerOunce(headline.pricePerOunceCents) : null;

  if (!headline) return null;

  return (
    <article
      id={`venue-card-${venue.id}`}
      aria-current={isSelected ? "true" : undefined}
      className={clsx(
        "pf-card scroll-mt-4 overflow-hidden transition-shadow",
        isSelected && "ring-2 ring-ink ring-offset-2 ring-offset-paper",
      )}
    >
      {/*
        The card body is a full-bleed button (select on the map) with the venue
        name layered above it as a real link. Nesting an <a> inside a <button>
        is invalid HTML, and without a crawlable <a href> the venue pages have
        no inbound links at all — the sitemap was the only path to them.
        The overlay pattern keeps both: click anywhere to select, click the
        name to open the venue page, and both are keyboard reachable.
      */}
      <div className="relative">
        <button
          type="button"
          onClick={() => onSelect(venue.id)}
          aria-label={`Show ${venue.name} on the map`}
          className="absolute inset-0 z-0 size-full"
        />

        <div className="pointer-events-none relative z-10 flex gap-3 p-3 text-left">
        <div
          aria-hidden
          className="flex w-[76px] shrink-0 flex-col items-center justify-center rounded-lg bg-amber-wash px-1 py-2"
        >
          <PriceBlock priceCents={headline.priceCents} currency={headline.currency} size="lg" />
          {perOunce && (
            <span className="mt-1 text-[10px] font-semibold text-amber-deep tabular-nums">
              {perOunce}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="wordmark min-w-0 truncate text-[1.05rem] leading-snug text-ink">
              {/*
                -my-1.5/py-1.5 grows the tap area without moving anything: a
                17px inline target is easy to miss on a phone, and a miss here
                lands on the card behind it instead of opening the venue.
              */}
              <Link
                href={`/venue/${venue.slug}`}
                className="pointer-events-auto -my-1.5 inline-block py-1.5 hover:underline hover:decoration-rule-strong hover:underline-offset-4"
              >
                {venue.name}
              </Link>
            </h3>
            {distance && (
              <span className="shrink-0 pt-0.5 text-xs font-semibold text-ink-soft tabular-nums">
                {distance}
              </span>
            )}
          </div>

          <p className="truncate text-xs text-ink-faint">
            {[venue.neighborhood, venue.city, venue.state].filter(Boolean).join(" · ")}
            {venue.status === "temporarily_closed" && (
              <span className="ml-1 font-semibold text-stale">· Temporarily closed</span>
            )}
          </p>

          <p className="mt-1.5 text-sm font-semibold leading-tight text-ink">
            <span className="sr-only">{formatCents(headline.priceCents)} — </span>
            {headline.beerName}
          </p>
          <p className="text-xs text-ink-soft">{formatServingDescription(headline)}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <FreshnessBadge
              freshness={headline.freshness}
              daysSinceVerified={headline.daysSinceVerified}
            />
            {headline.verificationCount > 0 && (
              <span className="text-ink-soft">
                <span aria-hidden>👍</span> {headline.verificationCount}
              </span>
            )}
            {headline.isHappyHour && (
              <span className="rounded bg-amber-wash px-1.5 py-0.5 font-semibold text-amber-deep">
                Happy hour
              </span>
            )}
            {headline.isAvailableNow === true && headline.scheduleSummary && (
              <span className="font-semibold text-fresh">Available now</span>
            )}
          </div>

          {hint && <p className="mt-1 text-xs font-medium text-stale">{hint}</p>}

          {others.length > 0 && (
            <p className="mt-1.5 text-xs font-semibold text-ink-soft">
              {pluralize(venue.dealCount, "deal")} from{" "}
              {formatCents(venue.cheapestPriceCents)}
            </p>
          )}
        </div>
        </div>
      </div>

      <div className="border-t border-rule px-3 pb-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-h-11 w-full py-3 text-left text-xs font-semibold text-ink-soft hover:text-ink"
          aria-expanded={expanded}
          aria-controls={`venue-details-${venue.id}`}
        >
          {expanded ? "Hide details" : others.length > 0 ? "See all deals & confirm" : "Details & confirm"}
        </button>
      </div>

      {expanded && (
        <div id={`venue-details-${venue.id}`} className="px-3 pb-3">
          {others.length > 0 && (
            <>
              <div className="pf-perforation" />
              <ul className="divide-y divide-rule">
                {others.map((deal) => (
                  <DealRow
                    key={deal.id}
                    deal={deal}
                    onVerified={onVerified}
                    onReport={() => onReport(deal, venue)}
                    expanded
                  />
                ))}
              </ul>
            </>
          )}

          <div className="pf-perforation mt-2 pt-3">
            <VerifyControls
              deal={headline}
              onVerified={(patch) => onVerified(headline.id, patch)}
              onReport={() => onReport(headline, venue)}
            />
          </div>

          <div className="pf-perforation mt-3 space-y-4 pt-3">
            <MediaGallery
              venueId={venue.id}
              venueName={venue.name}
              kind="photo"
              title="Price evidence"
              emptyPrompt="No photos yet — a shot of the menu proves this price better than any tap."
              uploadLabel="📷 Add a photo of the price"
              purpose="price_evidence"
              dealId={headline.id}
            />
            <CommentsPanel venue={venue} />
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
            <MapLink
              name={venue.name}
              address1={venue.address1}
              city={venue.city}
              state={venue.state}
              postalCode={venue.postalCode}
              latitude={venue.latitude}
              longitude={venue.longitude}
              className="hover:text-ink"
            >
              {venue.address1 ? `${venue.address1} — directions` : "Directions"}
            </MapLink>
            {venue.website && (
              <a
                className="underline underline-offset-2 hover:text-ink"
                href={venue.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                Website
              </a>
            )}
            {venue.geoPrecision === "approximate" && (
              <span title="Pin position is approximate">Approximate location</span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export function VenueCardSkeleton() {
  return (
    <div className="pf-card flex gap-3 p-3" aria-hidden>
      <div className="pf-pulse h-[72px] w-[76px] rounded-lg bg-paper-sunk" />
      <div className="flex-1 space-y-2 py-1">
        <div className="pf-pulse h-4 w-1/2 rounded bg-paper-sunk" />
        <div className="pf-pulse h-3 w-1/3 rounded bg-paper-sunk" />
        <div className="pf-pulse h-3 w-2/3 rounded bg-paper-sunk" />
      </div>
    </div>
  );
}
