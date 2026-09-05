# Architecture

Reasoning behind the choices. `README.md` covers what things *are*; this covers
*why*, including the paths not taken.

---

## Drizzle over Prisma

Three things in this schema Prisma can't express without `Unsupported` escape
hatches, all load-bearing:

1. `geography(Point,4326)` for the PostGIS backend.
2. `price_per_ounce_cents` as a **generated column** — the value calculation has
   to live in the database so sorting by it is indexable and can never disagree
   with what's displayed.
3. **Partial unique indexes** — "one *open* moderation task per deal per kind"
   and "one verification per person per deal per day" are enforced by the
   database, not by application logic that a race can defeat.

Drizzle also ships no query engine binary, which keeps serverless cold starts
cheap.

---

## Geo: why not just require PostGIS

PostGIS is the right answer at scale and the wrong answer for a first deploy.
Requiring it means every contributor and every trial host must have it before
the app will boot, and plenty of managed Postgres offerings don't enable it by
default.

So `src/db/geo.ts` is an interface with two implementations, auto-detected at
boot:

```
haversine   bbox prefilter on a btree (latitude, longitude)  →  exact haversine sort
postgis     GiST on geography(Point,4326)                    →  ST_DWithin / ST_Distance
```

The haversine path is not a toy. The bbox prefilter does the index work; the
trigonometry only touches rows that already survived it. That's comfortable well
past 100k venues. PostGIS wins on very large radii, kNN ordering and polygon
work — all things worth having, none worth blocking launch on.

**Nothing above this module knows which backend is active.**

---

## Two queries, not one

`searchDeals` deliberately makes two round trips:

1. Rank and page **venues**, aggregating over their matching deals.
2. Fetch matching deals for exactly that page of venues.

One query would either fan out rows (N deals × venue columns, re-sorted in JS —
which breaks paging) or need a lateral JSON aggregation the planner handles
badly once the corpus is large. Two indexed queries stay flat as data grows, and
the second is bounded by `limit`, never by the size of the result set.

---

## Freshness is computed, never stored

A stored `is_fresh` boolean is wrong the moment a scheduled job doesn't run, and
on a site whose entire value proposition is "this price was confirmed 3 days
ago", silently-wrong freshness is worse than no freshness.

Thresholds live once in `src/lib/freshness.ts` and are interpolated into the SQL
in `src/server/sql-fragments.ts`, so the badge, the filter and the sort ranking
are guaranteed to agree.

The cost is arithmetic per row at query time. If "most confirmed" sorting ever
gets slow, the fix is a materialized column with a refresh job — noted in
`TODO.md`, not needed at MVP scale.

---

## Time and timezones

Recurring deal times are stored as **local wall-clock** `time` values plus a
`day_of_week`, and the venue carries an IANA `timezone`. Availability is
evaluated as:

```sql
EXTRACT(DOW FROM (now() AT TIME ZONE venues.timezone))
```

Postgres owns the DST rules, per venue, correctly in every state. There is no
`America/New_York` default anywhere — `timezoneForLocation()` derives it from
state and longitude, and any venue can override it explicitly.

Overnight windows (`end_time < start_time`) are matched against both today's
windows and yesterday's wrapping ones.

---

## Trust: what auto-applies and what doesn't

| Action | Applies immediately | Why |
|---|---|---|
| Still there / Gone | ✅ | The freshness badge is only useful if it updates the moment someone at the bar taps it. Reversible, low-risk. |
| Comment | ✅ (visible) | Moderatable after the fact. |
| New deal, price change, new venue | ❌ queued | Creates authoritative data. |
| Report a problem | ❌ never auto-acts | |
| Escalation threshold crossed | ❌ opens a decision | |

**The rule:** community reports never delist anything by themselves. Auto-expiring
a deal after N "it's gone" reports hands every competitor a three-tap delete
button for every listing on the site. Crossing the threshold creates a *task*;
a human (or an agent assigned to that task's issue) decides.

Counting is by **distinct reporters**, not report volume, so one person can't
escalate anything alone. And negatives must *outnumber* recent confirmations —
a deal with six confirmations isn't escalated by two complaints.

### Verifications are scoped to a price

`deal_verifications.verifiedPriceCents` records the price the voter saw. When a
price changes, counters reset. Otherwise a deal that quietly went from $1 to $3
would inherit "confirmed by 12 people" for a number nobody confirmed.

### Anonymous identity

`sha256(ip + user-agent + rotating salt)`, truncated. **No raw IP is stored.**
Deliberately weak: enough for rate limiting and one-vote-per-person-per-day, not
enough to track anyone. Rotating the salt invalidates all historical hashes.

`contributors.userId` is already on the table, so accounts become a join rather
than a migration.

---

## Comments: explicit signal over inference

Comments carry a status chosen by the commenter. The alternative — inferring
intent from prose — fails in exactly the cases that matter:

> "no longer $5, it's $4 now" ← good news, reads as negative to any keyword scan

A keyword scan *does* run, but only to set `needsReview` when the prose looks
negative and the chosen signal doesn't. It never escalates on its own.

---

## Map rendering

Price markers are **stretchable rounded-rect icons** registered via
`map.addImage(..., { stretchX, stretchY, content })` and drawn with
`icon-text-fit: both`. One image stretches to fit `$1` or `$14.50`, and every
marker stays a GPU symbol — thousands of pins hold 60fps where DOM markers
would not.

`symbol-sort-key: ["get", "priceCents"]` means the **cheapest** pill wins
placement when two would collide, so the best deal in a dense block is the one
that survives.

### Layer installation is retry-based, not event-based

`applyData()` does **not** gate on `map.isStyleLoaded()`. That flag only flips
during a render pass, so in a backgrounded or throttled tab (no
`requestAnimationFrame`) it stays false forever and the markers never install —
even though the style spec is parsed and would accept them. Instead the install
is attempted, every subsequent map event is a free retry, and each step is
individually idempotent so a partial failure converges.

This was a real bug found during development: the map rendered a perfect
basemap with zero markers.

### One map instance

The mobile and desktop layouts share a single `MapView`, shown and hidden with
CSS. Rendering the component in two breakpoint containers creates two WebGL
contexts, doubles tile requests, and leaves the hidden one at 0×0. A
`ResizeObserver` calls `map.resize()` when the pane becomes visible.

---

## Massachusetts is a default, not an assumption

`state` is one optional predicate among many. It is never implied by proximity:
the moment a visitor shares a location or picks a place, the state filter is
**dropped**, so someone in Attleboro sees Providence.

Launching a new state requires: seed data. That's it. The gazetteer already
carries all 50 states and DC, timezone derivation covers every state including
the split ones, and `/[state]/[city]` routes generate from the data.

---

## What the MVP deliberately doesn't have

User profiles, gamification, badges, social feeds, threaded replies, messaging,
photo uploads, a rich admin CMS. Each would have traded time against the core
loop: *open the site, see cheap beer, pick a place.*

The schema leaves room for all of them — `contributors`, `userId` columns,
`evidenceImageKeys`, `helpfulCount` — without any of them being built.
