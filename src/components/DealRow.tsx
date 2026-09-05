"use client";

import clsx from "clsx";
import { formatServingDescription } from "@/lib/format";
import { formatPricePerOunce } from "@/lib/money";
import { sourceLabel } from "@/lib/freshness";
import type { DealDTO } from "@/lib/types";
import { FreshnessBadge } from "./FreshnessBadge";
import { PriceBlock } from "./PriceBlock";
import { VerifyControls } from "./VerifyControls";

interface Props {
  deal: DealDTO;
  onVerified: (dealId: string, patch: Partial<DealDTO>) => void;
  onReport: (deal: DealDTO) => void;
  expanded?: boolean;
}

/** One purchasable thing. A venue's card renders one of these per deal. */
export function DealRow({ deal, onVerified, onReport, expanded = false }: Props) {
  const perOunce = formatPricePerOunce(deal.pricePerOunceCents);
  const sizeUnknown = deal.totalOunces === null;

  return (
    <li className="flex gap-3 py-3">
      <div className="w-16 shrink-0 text-right">
        <PriceBlock priceCents={deal.priceCents} currency={deal.currency} size="md" />
        {perOunce ? (
          <span className="mt-0.5 block text-[11px] font-medium text-ink-faint tabular-nums">
            {perOunce}
          </span>
        ) : (
          <span className="mt-0.5 block text-[11px] text-ink-faint">size&nbsp;?</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight text-ink">{deal.beerName}</p>

        <p className="mt-0.5 text-sm text-ink-soft">
          {formatServingDescription(deal)}
          {sizeUnknown && (
            <span className="ml-1 text-ink-faint" title="Nobody has confirmed the pour size">
              — value unknown
            </span>
          )}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {deal.isHappyHour && (
            <span className="rounded bg-amber-wash px-1.5 py-0.5 font-semibold text-amber-deep">
              Happy hour
            </span>
          )}
          {deal.scheduleSummary && <span className="text-ink-soft">{deal.scheduleSummary}</span>}
          {deal.isAvailableNow === true && !deal.scheduleSummary && (
            <span className="font-medium text-fresh">All day</span>
          )}
          {deal.isAvailableNow === true && deal.scheduleSummary && (
            <span className="font-semibold text-fresh">Available now</span>
          )}
          {deal.isAvailableNow === false && (
            <span className="text-ink-faint">Not right now</span>
          )}
          {deal.isAvailableNow === null && (
            <span className="text-ink-faint">Availability varies</span>
          )}
        </div>

        {deal.ruleDescription && (
          <p className="mt-1 text-xs italic text-ink-soft">{deal.ruleDescription}</p>
        )}
        {deal.restrictions && (
          <p className="mt-1 text-xs text-ink-soft">
            <span className="font-semibold">Note:</span> {deal.restrictions}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <FreshnessBadge freshness={deal.freshness} daysSinceVerified={deal.daysSinceVerified} />
          {deal.verificationCount > 0 && (
            <span className="text-ink-soft">
              <span aria-hidden>👍</span> {deal.verificationCount}{" "}
              {deal.verificationCount === 1 ? "confirmation" : "confirmations"}
            </span>
          )}
          {deal.disputeCount > 0 && (
            <span className="font-medium text-outdated">
              {deal.disputeCount} {deal.disputeCount === 1 ? "report" : "reports"} it&apos;s gone
            </span>
          )}
        </div>

        {expanded && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-ink-faint">
              Source: {sourceLabel(deal.sourceType)}
              {deal.sourceUrl && (
                <>
                  {" · "}
                  <a
                    href={deal.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="underline underline-offset-2 hover:text-ink"
                  >
                    view
                  </a>
                </>
              )}
            </p>
            {/* Preserved even when the original link dies. */}
            {deal.sourceSnapshot && (
              <blockquote className="border-l-2 border-rule-strong pl-2 text-xs italic text-ink-soft">
                {deal.sourceSnapshot}
              </blockquote>
            )}
            <VerifyControls
              deal={deal}
              onVerified={(patch) => onVerified(deal.id, patch)}
              onReport={() => onReport(deal)}
              compact
            />
          </div>
        )}
      </div>
    </li>
  );
}

export function DealRowSkeleton() {
  return (
    <li className="flex gap-3 py-3" aria-hidden>
      <div className="pf-pulse h-9 w-16 rounded bg-paper-sunk" />
      <div className="flex-1 space-y-2">
        <div className="pf-pulse h-4 w-2/3 rounded bg-paper-sunk" />
        <div className="pf-pulse h-3 w-1/3 rounded bg-paper-sunk" />
      </div>
    </li>
  );
}
