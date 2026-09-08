# Contributing

Two very different kinds of contribution matter here, and they have different bars.

---

## 1. Beer prices (the important one)

You don't need this repo, an account, or any technical knowledge. Use the site:

- **Add a deal** — venue and price are the only required fields.
- **Still there / Gone** — one tap, from the bar, no signup.
- **Comment** — pick the status that matches ("Still there", "Price changed",
  "Deal is gone", "Bar has closed") and add a line.

### Please don't guess

This is the one rule that really matters. If a bar advertises "$1 drafts"
without saying the size, **leave the size blank**. An honest unknown renders as
"size unknown" and simply excludes that deal from value sorting. A guessed
number silently corrupts every price-per-ounce comparison on the site and
nobody can tell it apart from a real measurement.

The same goes for addresses, hours and conditions. Blank beats plausible.

---

## 2. Code

```bash
npm install
cp .env.example .env
createdb pour_finder
npm run db:push && npm run db:seed
npm run dev
```

Before opening a PR:

```bash
npm run typecheck && npm run build
```

### House rules

- **TypeScript is strict**, including `noUncheckedIndexedAccess`. No `any`, no
  non-null assertions to silence the compiler.
- **Money is integer cents.** Never a float, never a formatted string in storage.
- **Unknown stays `NULL`.** Don't add defaults that fabricate data.
- **Never overwrite authoritative data without a revision.** Anything that
  changes a deal or venue writes a `deal_revisions` / `venue_revisions` row in
  the same transaction. Price history is the one thing here that can't be
  re-scraped.
- **Nothing may be Massachusetts-specific.** `state` is a filter dimension, not
  a partition, and never a hard boundary on proximity search — somebody in
  Attleboro should see Providence.
- **Don't put the database in the client bundle.** Pure helpers go in
  `src/lib/`; anything touching the database goes in `src/server/` or
  `src/db/` and imports `server-only`.
- **Comment the "why", not the "what."** The code says what it does.

### Where things live

| Path | What |
|---|---|
| `src/db/schema.ts` | The data model |
| `src/db/geo.ts` | PostGIS / haversine adapter — all proximity SQL |
| `src/server/deals-query.ts` | The main discovery query |
| `src/lib/freshness.ts` | Freshness thresholds (single source of truth, shared with SQL) |
| `src/components/map/` | MapLibre view, GeoJSON, price-pill icons |

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains the reasoning behind
the load-bearing decisions, including the paths not taken. Worth reading before
proposing a structural change.

### Changing the schema

```bash
# edit src/db/schema.ts, then:
npx drizzle-kit generate --name what_changed
npm run db:push
```

Commit the generated migration. Never edit an applied migration in place.

---

## Trust and safety

If you're touching moderation, verification or escalation, know the invariant
before you start:

> **Community reports never delist anything on their own.**

Auto-expiring a deal after N "it's gone" reports hands every competitor a
three-tap delete button for every listing on the site. Crossing a threshold
opens a *decision* for a human. Please don't "simplify" that away.

---

## Reporting a security issue

Email <villacv@gmail.com> rather than opening a public issue.
