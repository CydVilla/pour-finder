# Changelog

Notable changes to Pour Finder. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **A test suite** — 161 tests, no DOM and no database, under two seconds.
  Covers money, formatting, freshness, geo-math, env parsing, slugs, filter
  URL round-trips, timezones for all 50 states, submission schemas and the
  happy-hour table, with regressions pinned for the bugs that actually shipped.
- **Prettier (`printWidth: 100`) and a working `npm run lint`** — `next lint`
  dropped into an interactive setup prompt with no config present, so linting
  could never run in CI. `npm run check` runs format, lint, typecheck and test.
- **Price reports carry the price.** "The price is wrong" is the most common
  report and never asked what the price actually is. It is now stored in its
  own column and surfaced in a `/admin` queue with a one-click apply that goes
  through `applyPriceChange`, so revision history and the confirmation reset
  are identical to a community edit.
- **Add a price from the venue page** you are already reading, on both the
  with-deals and no-deals renders. The latter previously offered only a link
  back to the home page.

### Fixed
- **Every sheet rendered at 269px.** The scroll area was `flex-1 basis-0`, so
  it contributed nothing to the panel's content-based height and the panel
  sized itself to header + footer + `min-h` — Filters, Add-a-deal and Report
  all scrolled inside a letterbox while 400+px of the height they had already
  reserved sat empty. On an auto basis the panel grows to the visual-viewport
  cap, then the body shrinks and scrolls.
- **Selected chips went invisible under the cursor.** `.pf-chip:hover` is
  specificity (0,3,0) against `.pf-chip[aria-pressed="true"]` at (0,2,0), so
  hover repainted the background light while the label stayed paper-white.
  Hover is now scoped away from selected chips.
- **The Filters button was off-screen on a phone.** It sat 119px past the right
  edge at 375px wide, inside a scroll rail with no visible scrollbar, which put
  day, distance, serving type, beer style and happy hour out of reach on the
  most common phone width. Pinned outside the rail; verified to 320px.
- **A stated pour size lost to its own ounces.** Redbones' liter read
  "33.81 oz" instead of "liter (33.81 oz)".
- **Venue card titles were h3 directly under the page h1**, leaving a hole in
  the heading outline on the home, state and city pages. They are h2.

### Added
- **State happy-hour law surfaced where it matters.** Massachusetts — the
  launch state — has banned happy hour since 1984, and seven other states ban
  or restrict timed drink discounts, so the "Happy hour only" filter could only
  ever return nothing there and the submit form invited people to record a
  discount no bar may legally run. Both now show the state's actual rule
  (`src/lib/happy-hour-law.ts`). Indiana and Oklahoma are recorded as
  restricted rather than banned: Indiana's ban was repealed effective
  2024-07-01, which is why the widely reproduced "eight states" lists are wrong.
- **A "Loading map…" state.** Tiles take several seconds on a phone, and the
  map pane is `display:none` until "Map" is tapped, so the first thing people
  saw was a blank white rectangle.
- **16 more Boston bars, addresses only.** Verified street addresses and
  coordinates with no prices attached — the price data findable on the open web
  for these bars is from 2012-2014. They stay off the public list but are
  returned by the add-a-deal venue search, so a submitter picks their bar
  instead of hand-typing a duplicate.
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
