"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type LngLatBoundsLike,
  type Map as MapLibreMap,
} from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoundingBox } from "@/lib/geo-math";
import { formatHeroPrice } from "@/lib/money";
import { pluralize } from "@/lib/format";
import type { VenueDTO } from "@/lib/types";
import { venuesToGeoJson } from "./geojson";
import { createPillImage, PILL_STYLES } from "./pill-image";

const SOURCE_ID = "pf-venues";
const SELECTED_SOURCE_ID = "pf-selected";
const DEFAULT_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export interface MapFocus {
  lat: number;
  lng: number;
  zoom?: number;
  /** Bump to re-apply the same focus (e.g. tapping "Near me" twice). */
  nonce: number;
}

interface Props {
  venues: readonly VenueDTO[];
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string | null) => void;
  /** Fired only when the user taps "Search this area", never on every pan. */
  onSearchArea: (bounds: BoundingBox) => void;
  userLocation: { lat: number; lng: number } | null;
  focus: MapFocus | null;
  /** Bump to refit the viewport to the current results. */
  fitNonce: number;
  isLoading: boolean;
  className?: string;
}

export default function MapView({
  venues,
  selectedVenueId,
  onSelectVenue,
  onSearchArea,
  userLocation,
  focus,
  fitNonce,
  isLoading,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const programmaticMoveRef = useRef(false);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [showSearchArea, setShowSearchArea] = useState(false);
  const [styleFailed, setStyleFailed] = useState(false);

  // Latest values for handlers registered once on the map instance.
  const venuesRef = useRef(venues);
  venuesRef.current = venues;
  const onSelectRef = useRef(onSelectVenue);
  onSelectRef.current = onSelectVenue;

  /* ------------------------------------------------------------ init */

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_STYLE,
      center: [-71.0589, 42.3601], // Boston. Overridden the moment we have data.
      zoom: 12,
      attributionControl: { compact: true },
      // Keeps low-end phones from burning battery on a 3D globe they can't use.
      pitchWithRotate: false,
      dragRotate: false,
      maxZoom: 19,
      minZoom: 3,
    });
    mapRef.current = map;

    // Dev-only handle so the map can be poked from the console
    // (`__pfMap.getZoom()`, `queryRenderedFeatures`, …). Never in production.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __pfMap?: MapLibreMap }).__pfMap = map;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showAccuracyCircle: true,
      }),
      "top-right",
    );
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

    map.on("error", (event) => {
      // A dead tile host must not take the whole app down: the list still
      // works, so we only surface a notice when the STYLE itself failed to
      // load - not for a single 404 tile, and not for a transient glyph miss.
      const error = event.error as (Error & { status?: number }) | undefined;
      const isFetchFailure =
        typeof error?.status === "number" ? error.status >= 400 : /failed to fetch/i.test(error?.message ?? "");
      const hasNoStyle = (map.getStyle()?.layers?.length ?? 0) === 0;
      if (isFetchFailure && hasNoStyle) setStyleFailed(true);
      console.warn("[map]", error?.message ?? event);
    });

    /**
     * Install layers and push data on whichever style signal arrives first.
     *
     * Listening only for `load` is fragile: that event also waits on the
     * initial tile fetches, so a slow tile host, a backgrounded tab (no rAF,
     * therefore no render pass) or a style swap can leave it unfired forever
     * - and then no markers ever appear even though the basemap is fine.
     *
     * `applyData` is idempotent and reads the current venues from a ref, so
     * every subsequent event is a free retry. No "am I ready yet" flag to get
     * out of sync.
     */
    const pump = () => applyData(map, venuesRef.current);

    map.on("load", pump);
    map.on("styledata", pump);
    map.on("idle", pump);
    pump();

    // "Search this area" instead of refetching on every pan: cheaper, and it
    // stops results shuffling under the user's thumb mid-scroll.
    map.on("moveend", (event) => {
      if (programmaticMoveRef.current) {
        programmaticMoveRef.current = false;
        return;
      }
      if ((event as { originalEvent?: unknown }).originalEvent) setShowSearchArea(true);
    });

    map.on("click", "pf-clusters", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      const clusterId = feature.properties?.cluster_id as number | undefined;
      if (!source || clusterId === undefined) return;

      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        programmaticMoveRef.current = true;
        map.easeTo({
          center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom,
          duration: 400,
        });
      });
    });

    map.on("click", "pf-pins", (event) => {
      const venueId = event.features?.[0]?.properties?.venueId as string | undefined;
      if (venueId) onSelectRef.current(venueId);
    });

    // Tapping empty map clears the selection - a cheap "back" gesture.
    map.on("click", (event) => {
      const hits = map.queryRenderedFeatures(event.point, { layers: ["pf-pins", "pf-clusters"] });
      if (hits.length === 0) onSelectRef.current(null);
    });

    for (const layer of ["pf-pins", "pf-clusters"]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    return () => {
      popupRef.current?.remove();
      userMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ---------------------------------------------------------- resize */

  /**
   * The map pane is display:none on mobile while the list is showing, so the
   * canvas is 0x0 until the user switches. Without this the map paints blank
   * (or half-drawn) on the first switch and after any window resize.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    let lastWidth = 0;
    let lastHeight = 0;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      mapRef.current?.resize();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /* ------------------------------------------------------- data sync */

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyData(map, venues);
  }, [venues]);

  /* ------------------------------------------------------- selection */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(SELECTED_SOURCE_ID)) return;

    const selected = venues.find((v) => v.id === selectedVenueId) ?? null;
    const source = map.getSource(SELECTED_SOURCE_ID) as GeoJSONSource | undefined;

    source?.setData({
      type: "FeatureCollection",
      features: selected
        ? [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [selected.longitude, selected.latitude] },
              properties: { priceLabel: formatHeroPrice(selected.cheapestPriceCents) },
            },
          ]
        : [],
    });

    popupRef.current?.remove();
    popupRef.current = null;

    if (!selected) return;

    // Small on-map summary so the map is usable on its own, matching the card.
    popupRef.current = new maplibregl.Popup({
      offset: 20,
      closeButton: true,
      closeOnClick: false,
      maxWidth: "260px",
    })
      .setLngLat([selected.longitude, selected.latitude])
      .setHTML(popupHtml(selected))
      .addTo(map);

    popupRef.current.on("close", () => {
      if (popupRef.current) onSelectRef.current(null);
    });

    if (!map.getBounds().contains([selected.longitude, selected.latitude])) {
      programmaticMoveRef.current = true;
      map.easeTo({
        center: [selected.longitude, selected.latitude],
        duration: prefersReducedMotion() ? 0 : 450,
      });
    }
  }, [selectedVenueId, venues]);

  /* ------------------------------------------------------- viewport */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    programmaticMoveRef.current = true;
    map.easeTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? 13,
      duration: prefersReducedMotion() ? 0 : 500,
    });
    setShowSearchArea(false);
  }, [focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitNonce === 0) return;

    // Deterministic resize on every explicit refit. On mobile the map pane is
    // display:none while the list is showing, so MapLibre sizes its canvas to
    // its 400x300 fallback; the ResizeObserver above catches most cases but is
    // not delivered reliably in a throttled tab. Refits always follow a
    // visibility change, so this is the dependable hook.
    map.resize();
    if (venues.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const venue of venues) bounds.extend([venue.longitude, venue.latitude]);

    programmaticMoveRef.current = true;
    map.fitBounds(bounds as LngLatBoundsLike, {
      padding: { top: 60, bottom: 60, left: 40, right: 40 },
      maxZoom: 15,
      duration: prefersReducedMotion() ? 0 : 500,
    });
    setShowSearchArea(false);
  }, [fitNonce, venues]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    userMarkerRef.current?.remove();
    if (!userLocation) return;

    const el = document.createElement("div");
    el.style.cssText =
      "width:16px;height:16px;border-radius:999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,.35)";
    el.setAttribute("aria-hidden", "true");

    userMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map);
  }, [userLocation]);

  /* --------------------------------------------------------- actions */

  const handleSearchArea = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    setShowSearchArea(false);
    onSearchArea({
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLng: bounds.getWest(),
      maxLng: bounds.getEast(),
    });
  }, [onSearchArea]);

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="size-full"
        role="application"
        aria-label={`Map of ${pluralize(venues.length, "venue")} with beer deals. The list below the map has the same results in text form.`}
      />

      {styleFailed && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
          <p className="pf-card px-3 py-2 text-xs text-ink-soft">
            Map tiles are unavailable. The list still works.
          </p>
        </div>
      )}

      {showSearchArea && (
        <div className="absolute inset-x-0 top-3 z-10 flex justify-center px-3">
          <button
            type="button"
            onClick={handleSearchArea}
            className="pf-button pf-button-primary pf-fade-in px-4 py-2 text-sm shadow-lift"
          >
            Search this area
          </button>
        </div>
      )}

      {isLoading && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10">
          <span className="pf-card px-2.5 py-1 text-xs font-semibold text-ink-soft">Loading…</span>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- map setup */

function registerImages(map: MapLibreMap): void {
  for (const style of Object.values(PILL_STYLES)) {
    if (map.hasImage(style.id)) continue;
    const image = createPillImage(style.fill, style.stroke);
    if (image) map.addImage(style.id, image.data, image.options);
  }
}

/**
 * Reuses a font stack the loaded style already provides glyphs for. Hardcoding
 * "Open Sans Bold" breaks silently on any style that doesn't ship it, and the
 * basemap is meant to be swappable.
 */
function detectFontStack(map: MapLibreMap): string[] {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type !== "symbol") continue;
    const font = layer.layout?.["text-font"];
    if (Array.isArray(font) && font.every((f) => typeof f === "string")) {
      return font as string[];
    }
  }
  return ["Open Sans Bold", "Arial Unicode MS Bold"];
}

function registerLayers(map: MapLibreMap): void {
  const fontStack = detectFontStack(map);
  const addLayer = (layer: LayerSpecification) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  };

  if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 14,
    // Lets a cluster know the cheapest price it contains (used in aria/tooltip
    // and available for future cluster labelling).
    clusterProperties: { minPrice: ["min", ["get", "priceCents"]] },
  });

  if (!map.getSource(SELECTED_SOURCE_ID)) {
    map.addSource(SELECTED_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  addLayer({
    id: "pf-clusters",
    type: "circle",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#17130f",
      "circle-radius": ["step", ["get", "point_count"], 17, 10, 21, 50, 26],
      "circle-stroke-width": 3,
      "circle-stroke-color": "#f0a202",
    },
  });

  addLayer({
    id: "pf-cluster-count",
    type: "symbol",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": fontStack,
      "text-size": 13,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#faf6ef" },
  });

  const pillImage: ExpressionSpecification = [
    "case",
    ["==", ["get", "isStale"], 1],
    PILL_STYLES.stale.id,
    ["==", ["get", "isCheap"], 1],
    PILL_STYLES.cheap.id,
    PILL_STYLES.default.id,
  ];

  addLayer({
    id: "pf-pins",
    type: "symbol",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": pillImage,
      "icon-text-fit": "both",
      "icon-text-fit-padding": [3, 8, 3, 8],
      "text-field": ["get", "priceLabel"],
      "text-font": fontStack,
      "text-size": 13,
      // Cheapest wins when two pills would collide, so the best deal in a
      // dense block is the one that survives placement.
      "symbol-sort-key": ["get", "priceCents"],
      "icon-allow-overlap": false,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": ["case", ["==", ["get", "isStale"], 1], "#6b645d", "#17130f"],
    },
  });

  addLayer({
    id: "pf-selected",
    type: "symbol",
    source: SELECTED_SOURCE_ID,
    layout: {
      "icon-image": PILL_STYLES.selected.id,
      "icon-text-fit": "both",
      "icon-text-fit-padding": [4, 10, 4, 10],
      "text-field": ["get", "priceLabel"],
      "text-font": fontStack,
      "text-size": 15,
      "icon-allow-overlap": true,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#f0a202" },
  });
}

/**
 * Installs our sources/layers if the style will accept them yet, then pushes
 * the current venues. Safe to call as often as you like; returns false when
 * the style is not ready, in which case a later map event retries.
 */
function applyData(map: MapLibreMap, venues: readonly VenueDTO[]): boolean {
  // Deliberately NOT gated on `map.isStyleLoaded()`. That flag only flips
  // during a render pass, so in a backgrounded or throttled tab (no rAF) it
  // stays false forever and the markers never install - even though the style
  // spec has been parsed and would happily accept them. Instead we attempt the
  // install and let MapLibre object if it really isn't ready; every subsequent
  // map event is a free retry, and each step below is individually idempotent
  // so a partial failure converges rather than wedging.
  try {
    registerImages(map);
    registerLayers(map);
  } catch {
    return false;
  }

  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return false;
  source.setData(venuesToGeoJson(venues));
  return true;
}

/* -------------------------------------------------------------- popup */

function popupHtml(venue: VenueDTO): string {
  const deal = venue.deals[0];
  const extra =
    venue.dealCount > 1
      ? `<p style="margin:6px 0 0;font-size:11px;font-weight:600;color:#57504a">${escapeHtml(
          pluralize(venue.dealCount, "deal"),
        )} from ${escapeHtml(formatHeroPrice(venue.cheapestPriceCents))}</p>`
      : "";

  return `
    <div style="padding:10px 12px;font-family:system-ui,sans-serif;max-width:236px">
      <p style="margin:0;font-size:14px;font-weight:800;letter-spacing:-.01em;color:#17130f">
        ${escapeHtml(venue.name)}
      </p>
      <p style="margin:2px 0 0;font-size:11px;color:#8a827a">
        ${escapeHtml([venue.neighborhood, venue.city].filter(Boolean).join(" · "))}
      </p>
      ${
        deal
          ? `<p style="margin:8px 0 0;display:flex;align-items:baseline;gap:6px">
               <span style="font-size:22px;font-weight:800;letter-spacing:-.03em;color:#17130f">
                 ${escapeHtml(formatHeroPrice(deal.priceCents))}
               </span>
               <span style="font-size:12px;color:#17130f">${escapeHtml(deal.beerName)}</span>
             </p>`
          : ""
      }
      ${extra}
    </div>`;
}

/** Venue names are community-submitted; never interpolate them raw. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
