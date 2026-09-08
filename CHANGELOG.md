# Changelog

Notable changes to Pour Finder. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Site assets.** SVG favicon (`src/app/icon.svg`) and a generated 1200×630
  Open Graph share card (`src/app/opengraph-image.tsx`, rendered by `next/og`
  from system fonts, so no binary asset and no webfont fetch).
- **Architecture Decision Records** in [`docs/adr/`](docs/adr/) — ten decisions,
  each with the consequences it costs, not just the case for it.
- **`docs/SETUP.md`** — end-to-end runbook: local development, deployment,
  every environment variable, where each asset comes from, and the failure
  modes with their symptoms.
- **`npm run db:check`** — validates `DATABASE_URL` and connects without ever
  printing the password. Catches a placeholder pasted verbatim, a malformed
  URL, Neon's direct endpoint where the pooled one is wanted, a missing
  `sslmode`, DNS/timeout/auth failures, and a database that connects but has no
  schema or no data.
- **`npm run env:pull` / `db:*:prod`** — run migrations and seeding against the
  deployed database using Vercel's pulled environment, so the connection string
  never has to be handled by hand.
- MIT `LICENSE`, `CONTRIBUTING.md`, `.nvmrc`.

### Fixed
- **Deploys failed at build time with no database.** The Postgres client
  connected at module scope, and `next build` imports every route module to
  collect page data — so a missing `DATABASE_URL` failed the build instead of
  producing a runtime error. The client and Drizzle instance are now created
  lazily on first query. A build no longer needs a database.
- **Empty environment variables were treated as set.** `process.env.X ?? y`
  only catches `undefined`, but Next inlines missing `NEXT_PUBLIC_*` variables
  as `''` — so `NEXT_PUBLIC_SITE_URL` became `''` and `new URL('')` threw
  during page-data collection (`ERR_INVALID_URL`). All reads now go through
  `src/lib/env.ts`, where empty and whitespace-only count as unset. The same
  sweep caught `DATABASE_POOL_MAX=""` parsing to `0` — a pool that can never
  open a connection.
- **Documentation was copy-pasteable into a broken state.** The deployment
  guide used `postgres://…neon.tech/…` as a placeholder; the ellipsis is a real
  character, so pasting the line produced a plausible-looking URL resolving to
  nothing. Replaced with complete, obviously-fake examples.

## [0.1.0] — 2026-09-05

First working version. One page, a map, and Massachusetts seed data.

### Added

**Data model**
- Venues and deals as separate entities; a venue has many deals.
- `deal_revisions` / `venue_revisions`, append-only. Coogan's `$1 → $2 → $1` is
  three revisions with actor, source and timestamp. Nothing is overwritten in
  place without a revision in the same transaction, and nothing is ever deleted
  — closed venues and ended deals are marked.
- Money as integer cents throughout. `$0` is legal; no upper bound.
- Nullable serving size with a **generated** `price_per_ounce_cents` that is
  `NULL` whenever volume is unknown, so "best value" cannot invent a number.
  Buckets use `quantity × individual_serving_size_oz`.
- Per-venue IANA timezone; recurring schedules stored as local wall-clock and
  evaluated as `now() AT TIME ZONE venues.timezone` — DST-correct in all 50
  states, with overnight windows handled.
- `geo_precision` on venues, so an unconfirmed address is marked approximate
  rather than given a fake rooftop pin.

**Discovery**
- Single-page map/list experience; the homepage is the whole application.
- MapLibre GL JS with clustering and GPU-rendered stretchable price pills, one
  marker per venue showing its cheapest deal. "Search this area" instead of
  refetching on every pan.
- Filters (price, distance, serving type, beer, availability, freshness) with
  secondary filters behind one sheet; five sorts with explicit tie-breakers.
- Computed freshness (`fresh` / `aging` / `stale` / `likely_outdated` /
  `unverified`) and a confidence score from source, recency, confirmations and
  disputes.
- Free offline gazetteer — 50 states, cities, neighborhoods and ZIPs — so
  city/ZIP search costs nothing and works without network egress.
- Geo adapter with two backends: portable bbox+haversine by default, PostGIS
  auto-detected.

**Community**
- One-tap "Still there / Gone" with no account, rate limited, one vote per
  person per deal per day, scoped to the price that was confirmed.
- Submission pipeline with venue and deal duplicate detection, into a
  moderation queue.
- PlugShare-style comments carrying an explicit status signal.
- Escalation from repeated independent reports into a `moderation_task`,
  optionally mirrored as a GitHub issue with an HMAC-signed callback that
  applies the decision when the issue is closed. Reports never delist anything
  on their own.
- `/admin` moderation queue behind a shared token.

**Content**
- 15 Massachusetts venues, 49 active deals, plus historical examples — A&B
  Kitchen's expired $3 Coors Light, and Eddie C's (closed 2025) retained with
  its history. Certainty recorded honestly throughout: Mike's "medium" and
  "large" stay exactly that, and Redbones' pre-ownership-change prices are
  dated so they render as *likely outdated* on first load.

**Routes**
- `/`, `/[state]`, `/[state]/[city]`, `/venue/[slug]`, `sitemap.xml`,
  `robots.txt`.

### Fixed during the initial audit
- **Every distance query was broken.** Postgres inferred `integer` for the
  Earth-radius bind parameter in the haversine expression and rejected
  `6371008.8` at runtime, taking out "Near me", distance sort, radius filtering
  and positioned venue search. All numeric geo binds are now cast explicitly.
- MapLibre was mounted twice, once per breakpoint container — two WebGL
  contexts, doubled tile requests, and the hidden one stuck at 0×0.
- Layer installation gated on `map.isStyleLoaded()`, which only flips during a
  render pass, so a throttled or backgrounded tab rendered a perfect basemap
  with zero markers. Installation is now attempt-and-retry and idempotent.
- Deals within a venue now order by the active sort, so "best value" leads with
  the best-value deal rather than the cheapest one.
- The last mobile card was trapped under the floating List/Map switch.
- Touch targets raised to 40px (44px for the card expander).
- Freshness labels pluralize ("1 month ago", not "1 months ago").

[Unreleased]: https://github.com/CydVilla/pour-finder/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CydVilla/pour-finder/releases/tag/v0.1.0
