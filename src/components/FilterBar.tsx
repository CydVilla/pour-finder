"use client";

import { PRICE_PRESETS_CENTS, SORT_OPTIONS, type DealFilters, type SortId } from "@/lib/filters";
import { formatCents } from "@/lib/money";

interface Props {
  filters: DealFilters;
  secondaryCount: number;
  resultCount: number;
  isLoading?: boolean;
  hasOrigin: boolean;
  onMaxPrice: (cents: number | undefined) => void;
  onSort: (sort: SortId) => void;
  onOpenFilters: () => void;
}

/**
 * The only filters on screen by default are the two people actually use:
 * a price ceiling and a sort. Everything else lives behind "Filters" so the
 * default view stays a list of cheap beer, not a control panel.
 */
export function FilterBar({
  filters,
  secondaryCount,
  resultCount,
  isLoading = false,
  hasOrigin,
  onMaxPrice,
  onSort,
  onOpenFilters,
}: Props) {
  return (
    <div className="border-b border-rule bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-3 py-2 sm:px-4">
        {/*
          Filters is pinned outside the scrolling rail, not appended to it.

          Inside the rail it sat 119px off the right edge of a 375px phone,
          reachable only by swiping a strip with no visible scrollbar — so on
          the most common phone width the entire secondary filter set (day,
          distance, serving, beer style, happy hour) was undiscoverable. The
          price chips may scroll; the way into everything else may not.
        */}
        <div className="flex items-center gap-1.5">
          <div
            className="pf-scroll-x -mx-1 flex min-w-0 flex-1 items-center gap-1.5 px-1 pb-0.5"
            role="group"
            aria-label="Maximum price"
          >
            <span className="shrink-0 pr-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
              Under
            </span>

            {PRICE_PRESETS_CENTS.map((cents) => (
              <button
                key={cents}
                type="button"
                aria-pressed={filters.maxPriceCents === cents}
                onClick={() => onMaxPrice(filters.maxPriceCents === cents ? undefined : cents)}
                className="pf-chip shrink-0 px-3 py-1.5 text-sm"
              >
                {formatCents(cents)}
              </button>
            ))}

            <button
              type="button"
              aria-pressed={filters.maxPriceCents === undefined}
              onClick={() => onMaxPrice(undefined)}
              className="pf-chip shrink-0 px-3 py-1.5 text-sm"
            >
              Any
            </button>
          </div>

          <span aria-hidden className="h-5 w-px shrink-0 bg-rule-strong" />

          <button
            type="button"
            onClick={onOpenFilters}
            className="pf-chip shrink-0 px-3 py-1.5 text-sm"
            data-active={secondaryCount > 0 ? "true" : undefined}
          >
            <span aria-hidden>⚙</span>
            Filters
            {secondaryCount > 0 && (
              <span className="ml-0.5 rounded-full bg-amber px-1.5 text-xs font-bold text-ink">
                {secondaryCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-soft" role="status" aria-live="polite">
            {isLoading ? (
              <span className="text-ink-faint">Updating…</span>
            ) : (
              <>
                <span className="font-bold text-ink tabular-nums">{resultCount}</span>{" "}
                {resultCount === 1 ? "place" : "places"}
              </>
            )}
          </p>

          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="font-semibold">Sort</span>
            <select
              className="pf-control rounded-md border-[1.5px] border-rule-strong bg-card px-2 py-1.5 text-xs font-semibold text-ink"
              value={filters.sort}
              onChange={(event) => onSort(event.target.value as SortId)}
            >
              {SORT_OPTIONS.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  // Closest is meaningless without a position to measure from.
                  disabled={option.id === "distance" && !hasOrigin}
                >
                  {option.label}
                  {option.id === "distance" && !hasOrigin ? " (needs location)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
