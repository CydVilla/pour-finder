# Setup & operations runbook

Everything needed to get Pour Finder running — locally, then deployed — plus
where every asset comes from and what breaks when it's missing.

---

## 1. Local development

**Requires:** Node 22 (`.nvmrc`), a Postgres you can create a database in.

```bash
git clone https://github.com/CydVilla/pour-finder.git
cd pour-finder
npm install
cp .env.example .env          # defaults point at a local Postgres
createdb pour_finder
npm run db:push               # create the schema
npm run db:seed               # load the Massachusetts data
npm run dev
```

Open <http://localhost:3000>. **No API keys are required** — see §4.

Verify with `npm run db:check`. It should end with:

```
venues: 15  active deals: 49  gazetteer: 119
✓ Database is ready to serve.
```

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:check` | Validate `DATABASE_URL` + connect. Prints no secrets. |
| `npm run db:push` | Apply migrations (+ PostGIS/pg_trgm if available) |
| `npm run db:push -- --drop` | Drop and rebuild the schema (dev only) |
| `npm run db:seed` | Seed Massachusetts data (idempotent) |
| `npm run db:seed -- --fresh` | Wipe venues/deals/places first |
| `npm run db:seed -- --demo` | Add labelled fixtures for happy hours, conditional rules and buckets |
| `npm run db:studio` | Drizzle Studio |
| `npm run env:pull` | Pull the deployed environment into `.env.production.local` |
| `npm run db:check:prod` / `db:push:prod` / `db:seed:prod` | The same, against the pulled production environment |

### Changing the schema

```bash
# edit src/db/schema.ts, then:
npx drizzle-kit generate --name what_changed
npm run db:push
```

Commit the generated migration. Never edit an applied migration in place.

---

## 2. Deploying

The full walkthrough is in [`DEPLOYMENT.md`](DEPLOYMENT.md). The short version,
for Vercel + Neon at $0:

1. **Vercel → Storage → Connect a Neon database.** The integration injects
   `DATABASE_URL` (pooled) and its siblings automatically. Take the *pooled*
   endpoint — serverless opens many short-lived connections and exhausts the
   direct one.
2. **Set the remaining variables** (§3). `NEXT_PUBLIC_SITE_URL` must be type
   **Config**, not Secret — Vercel refuses to keep a browser-exposed
   `NEXT_PUBLIC_*` variable secret, and a saved Secret cannot be converted, so
   it has to be deleted and re-added.
3. **Load the schema and data.** Vercel does not run migrations:
   ```bash
   npm run env:pull        # writes .env.production.local (gitignored)
   npm run db:check:prod
   npm run db:push:prod
   npm run db:seed:prod
   ```
4. **Redeploy.** Saving environment variables does **not** rebuild —
   Vercel bakes them in at build time. Deployments → latest → ⋯ → Redeploy.

---

## 3. Environment variables

| Variable | Required | Default | What it does |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | Postgres connection string. Without it the app builds and serves, but every query returns an error. |
| `NEXT_PUBLIC_SITE_URL` | production | `http://localhost:3000` | Canonical origin for metadata, sitemap and the share card. Wrong value → sitemap advertises localhost. |
| `SUBMITTER_HASH_SALT` | production | `dev-salt` | Salts anonymous contributor hashes. Leaving the default makes hashes guessable. Rotating it un-links all history by design. |
| `ADMIN_TOKEN` | no | — | Unlocks `/admin`. Unset **disables the page entirely** rather than leaving it open. Must be 16+ chars. |
| `GEO_BACKEND` | no | `auto` | `auto` probes for PostGIS, `postgis` requires it, `haversine` forces the portable path. |
| `DATABASE_POOL_MAX` | no | `10` | Pool size. Use `1` on serverless without a pooler. |
| `MODERATION_AUTO_APPROVE` | no | `false` | Publishes submissions instantly. Fine while seeding a market solo; **not** with open traffic. |
| `ESCALATION_THRESHOLD` | no | `2` | Distinct reporters needed before a moderation task opens. |
| `NEXT_PUBLIC_MAP_STYLE_URL` | no | CARTO Positron | Any MapLibre style URL. |
| `GEOCODER` | no | `gazetteer` | `gazetteer` (offline, free) or `nominatim`. |
| `NOMINATIM_CONTACT_EMAIL` | if nominatim | — | Required by their usage policy. |
| `GITHUB_TOKEN` / `GITHUB_REPO` | no | — | Mirrors moderation tasks as GitHub issues. |
| `GITHUB_ISSUE_ASSIGNEES` | no | — | Add `Copilot` to assign the coding agent. **Needs a paid Copilot plan**; if assignment is rejected the issue is still filed. |
| `MODERATION_WEBHOOK_SECRET` | no | — | HMAC secret for the GitHub Action callback. 16+ chars, or the endpoint stays disabled. |

Generate secrets with `openssl rand -hex 32`.

> **The app is designed to build and boot with none of these.** It serves its
> empty state and logs an actionable error. That is verified before release —
> see [ADR-0010](adr/0010-config-must-not-break-builds.md).

---

## 4. Assets — where everything comes from

Nothing here needs an account, a key, or a design tool.

| Asset | Source | Notes |
|---|---|---|
| **Map tiles** | CARTO Positron via `NEXT_PUBLIC_MAP_STYLE_URL` | No API key. Free, fair-use, non-commercial. Swap for MapTiler or self-hosted Protomaps by changing the URL. |
| **Map markers** | Drawn at runtime, `src/components/map/pill-image.ts` | Rounded-rect canvas images registered with `stretchX`/`stretchY`, stretched to fit by `icon-text-fit`. No image files. |
| **Map fonts (glyphs)** | The basemap style's own glyph endpoint | `detectFontStack()` reads the loaded style and reuses a font it already provides, so swapping basemaps doesn't break labels. |
| **UI fonts** | System stack (`ui-rounded`, then `system-ui`) | Deliberately no webfont: zero network cost, no build-time fetch, no FOUT. |
| **Favicon** | `src/app/icon.svg` | Inline SVG, served by Next's metadata routing at a hashed URL. |
| **Share card** | `src/app/opengraph-image.tsx` | 1200×630 PNG generated by `next/og` from system fonts. Edit the component, not an image. |
| **Icons in UI** | Unicode characters and emoji | No icon library. |
| **Gazetteer** | `src/db/seed-places.ts` | 50 states + DC, Boston-area cities, neighborhoods and ZIPs. Powers city/ZIP search offline. |
| **Seed venues** | `src/db/seed-venues.ts` | Hand-researched Massachusetts data with honest certainty markers. |

**Not yet implemented:** menu-photo uploads. `submissions.evidenceImageKeys`
exists but nothing writes to it; Cloudflare R2 (10 GB free, no egress fees) is
the intended target. See `TODO.md`.

---

## 5. Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Build fails: `Failed to collect page data`, `ERR_INVALID_URL, input: ''` | An env var set to an empty string | Should no longer happen — all reads go through `src/lib/env.ts`. If it recurs, the new read bypassed the helper. |
| Site loads, "No deals in this area yet", API returns `Could not load deals` | `DATABASE_URL` missing or wrong | `npm run db:check:prod` |
| `db:check` says "still contains a placeholder" | Docs example pasted verbatim | Copy the real string from Neon → Connect → **Pooled connection** |
| `connection is insecure` | Missing `?sslmode=require` | Append it |
| Sitemap lists `http://localhost:3000` | `NEXT_PUBLIC_SITE_URL` unset at **build** time | Set it, then **redeploy** — it's baked in at build |
| Env var saved but nothing changed | Vercel does not rebuild on env changes | Deployments → ⋯ → Redeploy |
| Vercel: "Remove the public framework prefix" | A `NEXT_PUBLIC_*` var set as Secret | Delete it and re-add as **Config** |
| Neon integration: "already has an existing environment variable" | A manual `DATABASE_URL` conflicts | Delete the manual one, then connect |
| Map is blank but the list works | Tile host unreachable, or a throttled/background tab (rendering is rAF-driven) | The list is a complete alternative. Check the browser console. |
| `/admin` 404s | `ADMIN_TOKEN` unset or under 16 chars | Set it and redeploy |
| Distance sort disabled | No position shared and no place searched | Expected — it's disabled rather than silently sorting by something else |

---

## 6. Operating notes

- **Back up before every migration.** `deal_revisions` is the irreplaceable
  table: deals can be re-scraped, price history cannot.
- **Rotate `SUBMITTER_HASH_SALT` periodically.** It un-links historical
  contributor hashes by design — a privacy feature, and the reason reputation
  can't accumulate until real accounts exist.
- **Turn `MODERATION_AUTO_APPROVE` off** before the site has open traffic.
- **Leave `ADMIN_TOKEN` unset** if you're not using `/admin`; that disables it
  rather than leaving it reachable.
- **Watch `moderation_tasks`** — nothing is ever auto-delisted, so an unattended
  queue means wrong data stays live ([ADR-0007](adr/0007-reports-never-auto-delist.md)).
