"use client";

import Link from "next/link";

import clsx from "clsx";
import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { milesToMeters, type BoundingBox } from "@/lib/geo-math";
import { countSecondaryFilters, serializeFilters, type DealFilters } from "@/lib/filters";
import { useDealSearch } from "@/lib/use-deal-search";
import { useGeolocation } from "@/lib/use-geolocation";
import type { DealDTO, DealSearchResponse, VenueDTO } from "@/lib/types";
import { AdSlot } from "./AdSlot";
import { AddDealSheet } from "./AddDealSheet";
import { EmptyState } from "./EmptyState";
import { FilterBar, ResultSummary } from "./FilterBar";
import { FilterSheet } from "./FilterSheet";
import { LogoMark } from "./LogoMark";
import { ReportSheet } from "./ReportSheet";
import { SearchBar, type PlacePick } from "./SearchBar";
import { VenueCard, VenueCardSkeleton } from "./VenueCard";
import type { MapFocus } from "./map/MapView";

// MapLibre is ~200KB and touches `window` at import time: load it only in the
// browser, and only once the shell has painted.
const MapView = dynamic(() => import("./map/MapView"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-paper-sunk" />,
});

interface Props {
  initialData: DealSearchResponse;
  initialFilters: DealFilters;
  initialSearchFailed?: boolean;
}

type MobileView = "list" | "map";

const DEFAULT_NEARBY_RADIUS_METERS = Math.round(milesToMeters(5));

export function DiscoveryApp({ initialData, initialFilters, initialSearchFailed = false }: Props) {
  const [filters, setFilters] = useState<DealFilters>(initialFilters);
  const [query, setQuery] = useState(initialFilters.q ?? "");
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ deal: DealDTO; venue: VenueDTO } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const [hasShownMap, setHasShownMap] = useState(false);

  const geo = useGeolocation();
  const listRef = useRef<HTMLDivElement>(null);
  const mapPaneRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, error, patchDeal, retry } = useDealSearch({
    initial: initialData,
    filters,
    skipFirstFetch: !initialSearchFailed,
  });

  const venues = data.venues;
  const hasOrigin = filters.lat !== undefined && filters.lng !== undefined;
  const secondaryCount = countSecondaryFilters(filters);

  // Load WebGL and map tiles only once the map has room to render. Keep the
  // same instance on later resizes so a fold doesn't reset the camera.
  useEffect(() => {
    const pane = mapPaneRef.current;
    if (hasShownMap || !pane) return;
    if (pane.clientWidth > 0 && pane.clientHeight > 0) {
      setHasShownMap(true);
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setHasShownMap(true);
        observer.disconnect();
      }
    });
    observer.observe(pane);
    return () => observer.disconnect();
  }, [hasShownMap, mobileView]);

  /* ------------------------------------------------------- URL syncing */

  // history.replaceState rather than router.replace: the URL should stay
  // shareable without re-running the server component on every filter tap.
  useEffect(() => {
    const params = serializeFilters(filters).toString();
    const url = params ? `${window.location.pathname}?${params}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [filters]);

  const update = useCallback((patch: Partial<DealFilters>) => {
    setFilters((current) => ({ ...current, ...patch, offset: 0 }));
  }, []);

  /* --------------------------------------------------------- location */

  useEffect(() => {
    if (!geo.position) return;
    setLocationLabel("your location");
    update({
      lat: geo.position.lat,
      lng: geo.position.lng,
      radiusMeters: filters.radiusMeters ?? DEFAULT_NEARBY_RADIUS_METERS,
      // Proximity beats state lines: someone in Attleboro should see
      // Providence. Picking a position clears the organizational filters.
      state: undefined,
      citySlug: undefined,
      minLat: undefined,
      maxLat: undefined,
      minLng: undefined,
      maxLng: undefined,
    });
    setMapFocus({ lat: geo.position.lat, lng: geo.position.lng, zoom: 14, nonce: Date.now() });
    // filters.radiusMeters intentionally omitted: only react to a new position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.position, update]);

  const pickPlace = useCallback(
    (place: PlacePick) => {
      setLocationLabel(place.label);
      update({
        lat: place.lat,
        lng: place.lng,
        radiusMeters: place.radiusMeters,
        q: undefined,
        state: undefined,
        citySlug: undefined,
        minLat: undefined,
        maxLat: undefined,
        minLng: undefined,
        maxLng: undefined,
      });
      setMapFocus({ lat: place.lat, lng: place.lng, zoom: 13, nonce: Date.now() });
    },
    [update],
  );

  const searchArea = useCallback(
    (bounds: BoundingBox) => {
      setLocationLabel("this area");
      update({
        minLat: bounds.minLat,
        maxLat: bounds.maxLat,
        minLng: bounds.minLng,
        maxLng: bounds.maxLng,
        // A viewport search replaces the radius; keeping both would silently
        // intersect two geographies the user only chose one of.
        radiusMeters: undefined,
        state: undefined,
        citySlug: undefined,
      });
    },
    [update],
  );

  /* ------------------------------------------- list <-> map selection */

  const selectVenue = useCallback((venueId: string | null) => {
    setSelectedVenueId(venueId);
    if (!venueId) return;

    // Scroll the matching card into view when a marker is tapped.
    window.requestAnimationFrame(() => {
      listRef.current?.querySelector(`#venue-card-${CSS.escape(venueId)}`)?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
    });
  }, []);

  // Drop a selection that's no longer in the result set (e.g. after filtering).
  useEffect(() => {
    if (selectedVenueId && !venues.some((venue) => venue.id === selectedVenueId)) {
      setSelectedVenueId(null);
    }
  }, [venues, selectedVenueId]);

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId) ?? null,
    [venues, selectedVenueId],
  );

  const clearFilters = useCallback(() => {
    setQuery("");
    setFilters((current) => ({
      ...current,
      q: undefined,
      maxPriceCents: undefined,
      servingTypes: [],
      beerTags: [],
      availableNow: undefined,
      happyHourOnly: undefined,
      allDayOnly: undefined,
      dayPart: "any",
      verifiedWithinDays: undefined,
      radiusMeters: undefined,
      offset: 0,
    }));
  }, []);

  /* -------------------------------------------------------------- view */

  const list = (
    <div ref={listRef} className="pf-scroll h-full overflow-y-auto overscroll-contain">
      <div className="space-y-2.5 p-3 sm:p-4">
        <ResultSummary
          className="discovery-wide:hidden"
          resultCount={data.total}
          isLoading={isLoading}
          sort={filters.sort}
          hasOrigin={hasOrigin}
          onSort={(sort) => update({ sort })}
        />

        {isLoading && venues.length === 0 ? (
          <>
            <VenueCardSkeleton />
            <VenueCardSkeleton />
            <VenueCardSkeleton />
          </>
        ) : venues.length === 0 && !error ? (
          <EmptyState
            maxPriceCents={filters.maxPriceCents}
            hasFilters={
              secondaryCount > 0 || filters.maxPriceCents !== undefined || Boolean(filters.q)
            }
            isSearching={Boolean(filters.q)}
            onRelaxPrice={() =>
              update({ maxPriceCents: Math.min((filters.maxPriceCents ?? 500) * 2, 2000) })
            }
            onWiden={() =>
              update({
                radiusMeters: filters.radiusMeters
                  ? Math.min(filters.radiusMeters * 2, 200_000)
                  : undefined,
                minLat: undefined,
                maxLat: undefined,
                minLng: undefined,
                maxLng: undefined,
              })
            }
            onClear={clearFilters}
            onAddDeal={() => setAddOpen(true)}
          />
        ) : venues.length > 0 ? (
          <>
            {venues.map((venue, index) => (
              <Fragment key={venue.id}>
                <VenueCard
                  venue={venue}
                  isSelected={venue.id === selectedVenueId}
                  onSelect={(venueId) => {
                    selectVenue(venueId);
                    setMobileView("map");
                  }}
                  onVerified={patchDeal}
                  onReport={(deal, v) => setReportTarget({ deal, venue: v })}
                />
                {/* Between cards, never inside one, and never above the
                    cheapest result — the first few are why people came. */}
                {index === 4 && <AdSlot slot="list-inline" height={250} />}
              </Fragment>
            ))}

            {data.truncated && (
              <p className="py-3 text-center text-xs text-ink-soft">
                Showing the {venues.length} best of {data.total}. Zoom in or filter to narrow it
                down.
              </p>
            )}

            <div className="py-4 text-center">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="pf-button pf-button-quiet px-4 py-2.5 text-sm"
              >
                <Plus className="size-4" strokeWidth={2.5} />
                Know a cheaper one? Add it
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  const map = (
    <MapView
      venues={venues}
      selectedVenueId={selectedVenueId}
      onSelectVenue={selectVenue}
      onSearchArea={searchArea}
      userLocation={geo.position}
      focus={mapFocus}
      isLoading={isLoading}
      className="relative size-full"
    />
  );

  return (
    <div className="relative flex h-full flex-col">
      <header className="shrink-0 border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2.5 sm:px-4">
          <Link
            href="/"
            className="flex min-h-11 min-w-touch shrink-0 items-center justify-center gap-1.5"
            aria-label="Pour Finder home"
          >
            <LogoMark className="size-7" />
            <span className="wordmark hidden text-lg leading-none sm:block">
              Pour<span className="text-amber-deep">Finder</span>
            </span>
          </Link>

          <SearchBar
            value={query}
            onChange={setQuery}
            onSearch={(value) => update({ q: value.trim() || undefined })}
            onPickPlace={pickPlace}
            onUseMyLocation={geo.request}
            locationLabel={locationLabel}
            isLocating={geo.state === "locating"}
          />

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="pf-button pf-button-amber min-w-touch shrink-0 px-3 py-2.5 text-sm"
          >
            <Plus className="size-4.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">Add a deal</span>
            <span className="sr-only sm:hidden">Add a beer deal</span>
          </button>
        </div>

        {(geo.state === "denied" || geo.state === "unavailable") && (
          <p
            role="status"
            className="border-t border-rule bg-paper-sunk px-3 py-1.5 text-xs text-ink-soft sm:px-4"
          >
            {geo.state === "denied"
              ? "Location is off — search a city or ZIP instead."
              : "Couldn't get your location. Try again or search a city or ZIP."}
          </p>
        )}
      </header>

      <FilterBar
        filters={filters}
        secondaryCount={secondaryCount}
        resultCount={data.total}
        isLoading={isLoading}
        hasOrigin={hasOrigin}
        onMaxPrice={(cents) => update({ maxPriceCents: cents })}
        onSort={(sort) => update({ sort })}
        onOpenFilters={() => setFiltersOpen(true)}
      />

      {error && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-rule px-3 py-1.5 text-sm sm:px-4">
          <p role="alert" className="font-medium text-outdated">
            {venues.length > 0 ? `${error} Showing the last results.` : error}
          </p>
          <button type="button" onClick={retry} className="pf-button pf-button-quiet shrink-0 px-3">
            Try again
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Deal results"
          className={clsx(
            "pf-list-pane min-h-0 min-w-0 discovery-wide:shrink-0 discovery-wide:border-r discovery-wide:border-rule",
            mobileView === "map" && "hidden discovery-wide:block",
          )}
        >
          {list}
        </section>

        <section
          ref={mapPaneRef}
          aria-label="Deal map"
          className={clsx(
            "relative min-h-0 min-w-0 flex-1",
            mobileView === "list" && "hidden discovery-wide:block",
          )}
        >
          {hasShownMap ? map : <div className="size-full bg-paper-sunk" />}

          {/* Marker tap on mobile surfaces the same card the list uses. */}
          {selectedVenue && (
            <div className="pf-scroll absolute inset-x-0 bottom-0 z-20 max-h-[65%] overflow-y-auto overscroll-contain p-3 discovery-wide:hidden">
              <VenueCard
                key={selectedVenue.id}
                venue={selectedVenue}
                isSelected
                idPrefix="map-venue"
                onSelect={() => setSelectedVenueId(null)}
                onVerified={patchDeal}
                onReport={(deal, v) => setReportTarget({ deal, venue: v })}
              />
            </div>
          )}
        </section>
      </div>

      <div className="flex shrink-0 justify-center border-t border-rule bg-paper py-1 discovery-wide:hidden">
        <div
          role="group"
          aria-label="View results as"
          className="flex gap-1 rounded-full border border-rule-strong bg-card p-0.5"
        >
          {(["list", "map"] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={mobileView === view}
              onClick={() => setMobileView(view)}
              className={clsx(
                "min-h-11 min-w-[86px] rounded-full px-4 py-2.5 text-sm font-bold transition-colors",
                mobileView === view ? "bg-ink text-paper" : "text-ink",
              )}
            >
              {view === "list" ? "List" : "Map"}
            </button>
          ))}
        </div>
      </div>

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        hasOrigin={hasOrigin}
        activeCount={secondaryCount}
        onChange={update}
        onClear={clearFilters}
        resultCount={data.total}
        isLoading={isLoading}
      />

      <AddDealSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        userLocation={geo.position}
        presetVenue={
          selectedVenue
            ? { id: selectedVenue.id, name: selectedVenue.name, state: selectedVenue.state }
            : null
        }
        onSubmitted={() => undefined}
      />

      <ReportSheet
        open={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        target={reportTarget}
      />
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
