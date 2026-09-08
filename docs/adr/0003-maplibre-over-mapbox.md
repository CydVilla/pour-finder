# ADR-0003: MapLibre over Mapbox

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

The map is a core feature, not a decoration. The app is free, has no revenue,
and its usage pattern is "open it in a bar, look, close it" — high map-load
count, zero monetisation.

Mapbox bills per map load. Worse, Mapbox's terms forbid **storing** geocoding
results unless you also use their maps, which is a direct trap for a database
whose whole purpose is storing venue coordinates.

## Decision

**MapLibre GL JS** (BSD, a fork of the last open-source Mapbox GL JS) with a
swappable tile source. Default: CARTO Positron, which needs no API key.
`NEXT_PUBLIC_MAP_STYLE_URL` overrides it.

Geocoding is a **separate** pluggable interface (`src/lib/geocode/`) whose
default is an offline gazetteer table, so no geocoding terms apply to stored
data at all.

## Consequences

**Good**

- $0 at launch, no API key in the setup path, no per-load billing cliff.
- Tile source is a URL, so Protomaps-on-R2 (a single `.pmtiles` file for the
  whole US) is a config change, not a migration.
- Storing coordinates is unambiguously ours to do.

**Bad**

- No Mapbox Studio; custom basemap styling means hand-editing style JSON.
- CARTO's free basemap is fair-use and non-commercial. If this ever monetises,
  the tile source must change (planned for: it's one env var).
- MapLibre's ecosystem of plugins is thinner; geocoder UI, directions and
  isochrones all have to be built or sourced elsewhere.
- Rendering is `requestAnimationFrame`-driven, so a backgrounded tab never
  completes style load. That is a real constraint the layer-installation code
  has to be written around (see ADR-0010's sibling concern about not gating on
  render-dependent state).
