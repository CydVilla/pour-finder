"use client";

import { formatCents } from "@/lib/money";

interface Props {
  maxPriceCents?: number;
  hasFilters: boolean;
  isSearching: boolean;
  onRelaxPrice: () => void;
  onWiden: () => void;
  onClear: () => void;
  onAddDeal: () => void;
}

/**
 * The empty state is a product surface, not an error. "No results" with no way
 * forward makes the filters feel broken, so every path out is one tap.
 */
export function EmptyState({
  maxPriceCents,
  hasFilters,
  isSearching,
  onRelaxPrice,
  onWiden,
  onClear,
  onAddDeal,
}: Props) {
  return (
    <div className="px-4 py-12 text-center">
      <div aria-hidden className="mx-auto mb-4 text-5xl">
        🍺
      </div>
      <h2 className="wordmark text-xl text-ink">
        {isSearching ? "Nothing matched that search" : "No deals in this area yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
        {hasFilters
          ? "Loosen a filter, or move the map somewhere else."
          : "Nobody has added a cheap beer here yet. Know one? It takes about twenty seconds."}
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {maxPriceCents !== undefined && maxPriceCents < 2000 && (
          <button type="button" className="pf-button pf-button-quiet px-4 py-2 text-sm" onClick={onRelaxPrice}>
            Raise price to {formatCents(Math.min(maxPriceCents * 2, 2000))}
          </button>
        )}
        <button type="button" className="pf-button pf-button-quiet px-4 py-2 text-sm" onClick={onWiden}>
          Search a wider area
        </button>
        {hasFilters && (
          <button type="button" className="pf-button pf-button-quiet px-4 py-2 text-sm" onClick={onClear}>
            Clear all filters
          </button>
        )}
        <button type="button" className="pf-button pf-button-amber px-4 py-2 text-sm" onClick={onAddDeal}>
          Add a beer deal
        </button>
      </div>
    </div>
  );
}
