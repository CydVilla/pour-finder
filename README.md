# 🍺 Pour Finder

**Where can I get a cheap beer near me?**

A community-driven map of cheap beer deals. Launching in Massachusetts, built
from day one to run in all 50 states.

The homepage is the whole app: open it, see cheap beer nearby, filter if you
need to, pick a place. No accounts, no feed, no navigation to learn.

---

## What makes this different from a directory

Beer prices change. **A price with no date on it is worthless**, so every deal
carries its own freshness:

```
$1   Bud Draft            ● Verified 3 days ago   👍 6 confirmations
$5   Redbones IPA 16oz    ● Verified 7 months ago — likely outdated
```

Anyone can tap **Still there** / **Gone** from the bar in one tap, with no
account. Old data visibly degrades rather than quietly lying.

---

## Quick start

```bash
git clone https://github.com/CydVilla/pour-finder.git
cd pour-finder
npm install
cp .env.example .env          # the defaults work against a local Postgres
createdb pour_finder
npm run db:push               # apply migrations
npm run db:seed               # load the Massachusetts research data
npm run dev
```

Open <http://localhost:3000>.

**No API keys are needed.** The map uses a free CARTO basemap with no key, and
city/ZIP search is served by a built-in offline gazetteer.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Apply migrations (+ optional PostGIS/pg_trgm upgrades) |
| `npm run db:push -- --drop` | Drop and rebuild the schema (dev only) |
| `npm run db:seed` | Seed the Massachusetts data (idempotent) |
| `npm run db:seed -- --fresh` | Wipe venues/deals/places first |
| `npm run db:seed -- --demo` | Also add labelled fixtures for happy hours, conditional rules and buckets |
| `npm run db:check` | Validate `DATABASE_URL` and test connectivity (prints no secrets) |
| `npm run env:pull` | Pull the deployed env into `.env.production.local` |
| `npm run db:push:prod` / `db:seed:prod` | Migrate/seed the deployed database |
| `npm run db:studio` | Drizzle Studio |

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router) + React 19 | SSR for a fast first paint and for SEO; route handlers are the API |
| Language | **TypeScript**, `strict` + `noUncheckedIndexedAccess` | |
| Styling | **Tailwind v4** (CSS-first `@theme`) | Tokens live in CSS; no build-time font fetches |
| ORM | **Drizzle** | SQL-first. Prisma can't express geography types, generated columns or partial unique indexes without escape hatches, and all three are load-bearing here |
| Database | **Postgres** (PostGIS optional) | See [Geo](#geo-two-backends-one-interface) |
| Map | **MapLibre GL JS** + CARTO basemap | See [Map](#map) |
| Validation | **Zod**, shared by the form and the route handler | One schema, two consumers |

**Docs**

| | |
|---|---|
| [`docs/SETUP.md`](docs/SETUP.md) | Runbook: local dev, deploy, every env var, every asset, failure modes |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How it fits together, and why |
| [`docs/adr/`](docs/adr/) | Decision records — ten decisions with the consequences each one costs |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Deploying for $0 |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed |
| [`TODO.md`](TODO.md) | What's next, and known limitations |

---

## Data model

The two rules everything else follows from:

1. **A venue is not a deal.** Coogan's is one venue with two `$1` draft deals.
   A venue has many deals; a deal's price changes over time.
2. **Unknown is a first-class value.** A bar advertising "$1 drafts" genuinely
   does not tell you the pour size. We store `NULL`, show "size unknown", and
   leave price-per-ounce unavailable rather than inventing a number.

```
venues ──┬── deals ──┬── deal_schedules      recurring windows, venue-local time
         │           ├── deal_revisions      append-only price/detail history
         │           ├── deal_verifications  one vote per person per deal per day
         │           └── deal_reports
         ├── venue_revisions                 renames, moves, closures
         ├── comments                        PlugShare-style, with an explicit signal
         └── moderation_tasks                queued decisions (mirrored to GitHub)

submissions      every community write, pending review
contributors     anonymous-first identity; ready for accounts
places           gazetteer: 50 states + cities + neighborhoods + ZIPs
rate_limit_events
```

### Decisions worth knowing

- **Money is integer cents.** Never floats. `$0` is legal; there is no upper bound.
- **`deal_revisions` is append-only.** Coogan's `$1 → $2 → $1` is three
  revisions with actor, source and timestamp. Nothing is overwritten in place
  without a revision in the same transaction.
- **`price_per_ounce_cents` is a generated column** that is `NULL` whenever the
  size is unknown, so "best value" sort cannot silently guess. Buckets use
  `quantity × individual_serving_size_oz`.
- **Freshness is computed, never stored.** A stored `is_fresh` flag is wrong the
  moment a cron doesn't run. Thresholds live in `src/lib/freshness.ts` and are
  interpolated into SQL so the badge, filter and sort can't disagree.
- **Verifications are scoped to a price.** A confirmation records the price it
  saw; when the price changes, the old consensus stops vouching for it.
- **Schedules are rows, not strings.** `(dayOfWeek, startTime, endTime)` in the
  venue's *local* wall clock, evaluated as `now() AT TIME ZONE venues.timezone`
  so DST is correct in every state. Rules no schema can encode ("during Red Sox
  games") live in `rule_description` and mark the deal conditional.
- **Nothing is deleted.** Closed venues and ended deals are marked, not removed.

---

## Geo: two backends, one interface

Every proximity predicate goes through `src/db/geo.ts`, which has two
interchangeable implementations:

- **`haversine`** *(default)* — btree bbox prefilter on `(latitude, longitude)`
  plus an exact haversine expression. Runs on **any** Postgres with no
  extensions, so the app deploys on a bare Neon/Supabase/brew instance.
- **`postgis`** — `geography(Point,4326)` + GiST + `ST_DWithin`/`ST_Distance`.
  Auto-detected at boot.

`npm run db:push` enables PostGIS automatically if it's available. Set
`GEO_BACKEND=postgis` to require it, or `haversine` to force the portable path.

**Recommendation:** turn PostGIS on in production, but don't let it block launch.

---

## Map

**MapLibre GL JS**, not Mapbox:

- **Cost.** Mapbox bills per map load — the wrong shape for a free utility people
  open in a bar. MapLibre is BSD-licensed with a swappable tile source. Default
  is CARTO Positron (no API key); override `NEXT_PUBLIC_MAP_STYLE_URL` for
  MapTiler, or self-host Protomaps for ~$0 at national scale.
- **Geocoding is separate on purpose.** Mapbox's terms forbid *storing* geocodes
  unless you also use their maps — a trap for a venue database. The geocoder is
  an interface (`src/lib/geocode/`) with a free offline gazetteer as the default.
- **One marker per venue**, never per deal, showing the venue's cheapest price.
- **Price pills are GPU symbols** (stretchable rounded-rect icons +
  `icon-text-fit`), so `$1` and `$14.50` both look right and thousands of pins
  stay at 60fps where DOM markers would not.
- **Clustering** via MapLibre's built-in supercluster.
- **"Search this area"** instead of refetching on every pan — cheaper, and
  results don't shuffle under your thumb.

---

## Community contributions

**Anonymous, with rate limiting.** Requiring an account before someone can tell
us a beer costs $2 would cut contributions to a fraction, and contribution
volume *is* the product. `contributors.userId` already exists for when accounts
land — reputation becomes a join, not a migration.

Anonymous identity is `sha256(ip + user-agent + rotating salt)`. **No raw IP is
ever stored.** It's deliberately weak: enough to rate limit and to enforce one
vote per person per deal per day, not enough to track anyone.

| Action | Applies |
|---|---|
| Still there / Gone | **Immediately** — the whole point of the freshness badge |
| Comment | Immediately (visible), signal feeds escalation |
| New deal / new venue / price change | **Moderation queue** |
| Report a problem | Queued for a human; never changes the listing |

Set `MODERATION_AUTO_APPROVE=true` for solo-operator mode while seeding a market.

### Comments and escalation

Comments carry an **explicit** status (`Still there`, `Price changed`,
`Deal is gone`, `Bar has closed`, `Just a note`) rather than one inferred from
prose — "no longer $5, it's $4 now" is good news, and keyword-sniffing gets that
backwards.

When **two or more independent people** report a deal as gone *and* they
outnumber recent confirmations, Pour Finder opens a `moderation_task`.

> **Reports never delist anything on their own.** Auto-expiring after N reports
> would hand every competitor a three-tap delete button. Crossing the threshold
> opens a *decision*, and a human makes it.

Optionally the task is mirrored as a **GitHub issue** (set `GITHUB_TOKEN` and
`GITHUB_REPO`). Closing that issue applies the decision via
[`.github/workflows/pour-finder-triage.yml`](.github/workflows/pour-finder-triage.yml):

```
close as "completed"    → deal expired (kept in history, never deleted)
close as "not planned"  → reports dismissed, listing stays live
```

The callback is HMAC-signed with `MODERATION_WEBHOOK_SECRET`, idempotent on
replay, and can only act on a task that already exists.

**Assigning Copilot:** put `Copilot` in `GITHUB_ISSUE_ASSIGNEES` to hand tasks
to the Copilot coding agent. That requires a **paid Copilot plan** with the
coding agent enabled for the repo. If assignment is rejected, the issue is still
filed without an assignee, and the built-in `/admin` queue does the same job for
free.

---

## Moderation

`/admin`, gated by `ADMIN_TOKEN` (16+ chars; unset disables the page entirely).
Shows pending submissions with duplicate warnings, and open moderation tasks.
Both admin and GitHub paths write through the same services, so history is
identical regardless of where a decision was made.

---

## Accessibility

Keyboard-operable throughout, visible focus rings (never `outline: none`), the
list is a full text alternative to the map, `prefers-reduced-motion` respected,
44px touch targets, 16px inputs so iOS doesn't zoom, and pinch-zoom is never
blocked. Freshness is communicated by colour **and** shape **and** a full
sentence.

---

## Project layout

```
src/
  app/
    page.tsx                  the whole discovery experience
    [state]/[city]/           /ma, /ma/boston — same app, pre-filtered
    venue/[slug]/             shareable per-venue page
    admin/                    moderation queue
    api/                      deals, comments, submissions, verify, report, webhooks
  components/
    DiscoveryApp.tsx          orchestrator: filters, selection, list/map sync
    map/                      MapLibre view, GeoJSON, price-pill icons
    …                         cards, sheets, filters, comments
  db/
    schema.ts                 the data model
    geo.ts                    PostGIS / haversine adapter
    seed-venues.ts            Massachusetts research data
    migrations/
  lib/                        pure, client-safe: money, freshness, filters, slugs
  server/                     server-only: queries, submissions, escalation
docs/
```

---

## Seed data

15 Massachusetts venues, 49 active deals, plus historical examples (A&B
Kitchen's expired $3 Coors Light; Eddie C's, closed in 2025, retained with
history). Certainty is recorded honestly:

- Sizes are `NULL` wherever the source didn't state one — Mike's "medium" and
  "large" stay exactly that.
- Venues whose street address couldn't be confirmed are marked
  `geoPrecision: approximate` with a note, rather than given a fake rooftop pin.
- Redbones' prices are dated ~7 months back because the restaurant changed
  ownership, so they render as *likely outdated* on first load.

See [`TODO.md`](TODO.md) for what's next.

---

## Contributing

Beer prices are the contribution that matters most, and they need no account and
no code — just use the site. The one rule: **don't guess.** If a bar advertises
"$1 drafts" without saying the size, leave the size blank. An honest unknown is
useful data; a plausible guess quietly corrupts every value comparison on the
site.

For code, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licence

[MIT](LICENSE) © Cyd Villavicencio

*Drink responsibly. 21+.*
