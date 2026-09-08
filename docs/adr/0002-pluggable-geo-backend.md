# ADR-0002: Pluggable geo backend, haversine by default

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

Proximity search is the core query. PostGIS is the obvious answer, but
requiring it means every contributor and every trial host must install and
enable it before the app boots. Plenty of managed Postgres offerings do not
enable it by default, and the local development machine for this project did
not have it available at all.

## Decision

Put every proximity predicate behind `src/db/geo.ts`, with two interchangeable
backends detected once per process:

- **`haversine`** (default): a btree bbox prefilter on `(latitude, longitude)`
  plus an exact haversine expression for distance and ordering. No extensions.
- **`postgis`**: `geography(Point,4326)` + GiST + `ST_DWithin` / `ST_Distance`.

`GEO_BACKEND=auto|postgis|haversine` controls it. `auto` probes for PostGIS and
falls back silently.

## Consequences

**Good**

- The app runs on any Postgres — bare Neon, Supabase, a brew install.
- The haversine path is not a toy: the bbox prefilter does the index work and
  the trigonometry only touches surviving rows. Comfortable past 100k venues.
- Upgrading is one migration and one env var; nothing above the module changes.

**Bad**

- Two code paths to keep correct, and the test matrix doubles for anything
  geo-related.
- The haversine path cannot do kNN ordering or polygon containment, so features
  needing those (drawing a search area, "within this neighbourhood polygon")
  will force the PostGIS requirement later.
- Silent fallback means a misconfigured production database quietly runs the
  slower path. `db:check` reports which backend is active to make that visible.
