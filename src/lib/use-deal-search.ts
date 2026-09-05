"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { serializeFilters, type DealFilters } from "./filters";
import type { DealDTO, DealSearchResponse, VenueDTO } from "./types";

interface Options {
  initial: DealSearchResponse;
  filters: DealFilters;
  /** Skip the first fetch when the server already rendered these filters. */
  skipFirstFetch: boolean;
}

/**
 * Owns result fetching.
 *
 * Three things matter here and each is deliberate:
 *  - debounce, so typing doesn't fire a query per keystroke;
 *  - AbortController, so an in-flight request is cancelled when filters change;
 *  - a monotonic sequence number, so a slow early response can never overwrite
 *    a fast later one (the classic map-app bug where panning fast shows the
 *    wrong results).
 */
export function useDealSearch({ initial, filters, skipFirstFetch }: Options) {
  const [data, setData] = useState<DealSearchResponse>(initial);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const skipRef = useRef(skipFirstFetch);
  const key = serializeFilters(filters).toString();

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }

    const sequence = ++sequenceRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/deals?${key}&rid=${sequence}`, {
          signal: controller.signal,
        });
        if (sequence !== sequenceRef.current) return; // a newer request won

        if (!response.ok) {
          setError("Couldn't load deals. Try again?");
          return;
        }

        const payload = (await response.json()) as DealSearchResponse;
        if (sequence !== sequenceRef.current) return;
        setData(payload);
      } catch (caught) {
        if ((caught as Error).name === "AbortError") return;
        setError("Couldn't reach the server.");
      } finally {
        if (sequence === sequenceRef.current) setIsLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  /**
   * Applies a confirmation locally so the badge updates the instant somebody
   * taps it, without refetching the whole viewport.
   */
  const patchDeal = useCallback((dealId: string, patch: Partial<DealDTO>) => {
    setData((current) => ({
      ...current,
      venues: current.venues.map((venue) =>
        venue.deals.some((deal) => deal.id === dealId)
          ? applyToVenue(venue, dealId, patch)
          : venue,
      ),
    }));
  }, []);

  return { data, isLoading, error, patchDeal };
}

function applyToVenue(venue: VenueDTO, dealId: string, patch: Partial<DealDTO>): VenueDTO {
  const deals = venue.deals.map((deal) => (deal.id === dealId ? { ...deal, ...patch } : deal));
  const best = deals.reduce<VenueDTO["bestFreshness"]>((acc, deal) => {
    const order = ["fresh", "aging", "stale", "likely_outdated", "unverified"] as const;
    return order.indexOf(deal.freshness) < order.indexOf(acc) ? deal.freshness : acc;
  }, "unverified");

  return { ...venue, deals, bestFreshness: best };
}
