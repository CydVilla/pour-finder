# Pour Finder — TODO

Running list. Newest thinking at the top of each section.

---

## Shipped (MVP)

- [x] Venue / deal separation with append-only `deal_revisions`
- [x] Integer-cent money; `$0` legal, no upper bound
- [x] Nullable serving size; generated `price_per_ounce_cents` that is `NULL` when size is unknown
- [x] Bucket/pitcher quantity metadata (`quantity`, `individual_serving_size_oz`)
- [x] Per-venue timezone; recurring schedules evaluated in venue-local time (DST-safe, 50 states)
- [x] Computed freshness (`fresh` / `aging` / `stale` / `likely_outdated` / `unverified`)
- [x] Confidence v1 from source type + recency + confirmations − disputes
- [x] Geo adapter: portable haversine default, PostGIS auto-detected
- [x] MapLibre map: clustering, GPU price pills, "Search this area", list↔map sync
- [x] Free offline gazetteer (50 states + cities + neighborhoods + ZIPs)
- [x] Filters (price, distance, serving, beer, availability, freshness) + 5 sorts with explicit tie-breakers
- [x] One-tap verification, anonymous, one vote per person per deal per day
- [x] Submission pipeline with duplicate detection and a moderation queue
- [x] PlugShare-style comments with an explicit status signal
- [x] Escalation → moderation task → optional GitHub issue → signed callback
- [x] `/admin` moderation queue
- [x] `/`, `/[state]`, `/[state]/[city]`, `/venue/[slug]`, sitemap, robots
- [x] Massachusetts seed data with honest certainty markers

---

## Next up

### Data quality
- [ ] **Menu photo uploads.** `submissions.evidenceImageKeys` exists but nothing
      writes to it. Cloudflare R2 is the cheapest fit (10GB free, no egress
      fees). Needs a signed-upload endpoint and an image moderation policy.
- [ ] **Backfill real coordinates** for the venues currently marked
      `geoPrecision: approximate` (J.J. Donovan's, A&B Kitchen, Eddie C's).
- [ ] **Timezone lookup by shapefile.** `src/lib/timezone.ts` disambiguates
      split states by longitude, which is wrong within ~20 miles of a boundary.
      Swap in `tz-lookup` when a market straddles one.
- [ ] Deal expiry sweep: surface deals past `expiresAt` in the admin queue
      (they already drop out of results, but nobody is told).

### Product
- [ ] **"Available now" as a default on mobile.** Most people opening this at
      6pm want what's pourable right now. Needs usage data first.
- [ ] Price history sparkline on the venue page — `/api/deals/[id]/history`
      already returns the data.
- [ ] Share sheet / OG images per venue.
- [ ] Saved/favourite bars (localStorage first; no account needed).
- [ ] `/deals-under-5/[city]` landing pages — the query layer supports it, only
      routing and copy are missing.

### Scale
- [ ] **Materialize confidence** into a column with a scheduled refresh. It's
      computed per-row in TS today, which is fine at thousands of deals and not
      at hundreds of thousands with a "most confirmed" sort.
- [ ] **Cursor pagination.** Currently `LIMIT/OFFSET`; deep offsets get slow.
- [ ] Turn on PostGIS in production and set `GEO_BACKEND=postgis`.
- [ ] Move rate limiting to Redis/Upstash when write volume justifies it
      (`src/server/rate-limit.ts` is two functions).
- [ ] Server-side clustering (tile-based) if a single viewport ever exceeds the
      300-venue ceiling in a way clustering can't absorb.

### Trust & safety
- [ ] **Contributor reputation.** `contributors.trustScore` is a flat 50. Every
      input needed to compute it properly is already persisted.
- [ ] Accounts (optional, never required for browsing). `userId` columns are in
      place on comments, verifications and submissions.
- [ ] Shadow-ban path for `contributors.isBlocked` — the column exists but
      nothing reads it yet.
- [ ] Comment flagging UI (`comments.flagCount` exists, no way to set it).
- [ ] Review the `needsReview` keyword heuristic against real comments before
      trusting it for anything beyond flagging.

### Legal / compliance
- [ ] Pick a licence before the repo goes public.
- [ ] Privacy page describing the anonymous hash and that no location is stored.
- [ ] Revisit the 21+ notice if any state requires a hard age gate.
- [ ] Terms covering user-submitted content and takedown requests.

---

## Known limitations

- **Venue opening hours are not modelled.** "Available now" answers *is the deal
  active*, not *is the bar open*. A 4-6pm happy hour at a bar that opens at 5 is
  reported as available at 4.
- **Overnight schedules attach to the start day.** A Friday 10pm–2am window is
  stored on Friday; the query handles the wrap into Saturday, but a submitter
  who enters it on Saturday will see it a day off.
- **The escalation threshold is a guess** (2 independent reporters). It should
  be tuned against real abuse patterns, and probably scaled by contributor trust
  once that exists.
- **Distance sort needs a position.** Disabled in the UI without one, rather
  than silently sorting by something else.
- **`queryRenderedFeatures` returns nothing while the tab is backgrounded** —
  the map's render loop is rAF-driven. Layer installation is resilient to this
  (`applyData` retries on every map event), but map screenshots in headless
  environments will come back blank.
