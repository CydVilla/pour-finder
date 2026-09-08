# Deploying Pour Finder

Goal: **$0/month** to start, with an honest note about where each free tier
actually ends.

---

## Recommended: Vercel Hobby + Neon

| Piece | Service | Cost |
|---|---|---|
| App | Vercel Hobby | $0 |
| Database | Neon free tier | $0 |
| Map tiles | CARTO basemap (no key) | $0 |
| Geocoding | Built-in offline gazetteer | $0 |
| Moderation tracker | GitHub Issues + Actions | $0 |

Why this pairing:

- **Neon** is plain Postgres, so the code runs unchanged. PostGIS is one
  `CREATE EXTENSION`. It scales to zero, so an idle app costs nothing. Free tier
  is 0.5 GB — roughly a hundred thousand deals with full revision history.
- **Vercel Hobby** is zero-config for Next.js and gives a real Node runtime, so
  `postgres.js` and interactive transactions work as written. Hobby is
  **non-commercial only** — fine now; if this ever takes money, move it to the
  Render workspace you already pay for (~$7/mo) with no code changes.

### Steps

1. **Database** — create a Neon project. In **Connection Details**, choose
   **Pooled connection** and copy the string. It looks like:

   ```
   postgres://neondb_owner:PASSWORD@ep-something-12345678-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

   > Take the **pooled** endpoint (the host contains `-pooler`). Serverless
   > functions open many short-lived connections and will exhaust the direct
   > endpoint. Keep `?sslmode=require` — Neon rejects plaintext.

   Optionally enable PostGIS in the Neon SQL editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;   -- optional but recommended
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```

2. **Check the string before using it**, then migrate and seed from your
   laptop — Vercel does not run migrations for you:
   ```bash
   export DATABASE_URL="<paste your real Neon pooled string here>"
   npm run db:check     # validates the URL and connects; prints no secrets
   npm run db:push      # create the schema
   npm run db:seed      # load the Massachusetts data
   ```

   `db:check` catches the common mistakes: a placeholder pasted verbatim, a
   missing `sslmode`, the direct-vs-pooled endpoint, auth failures, and a
   database that connected but has no schema yet.
3. **Deploy** — import the GitHub repo into Vercel and set:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | your real Neon **pooled** string |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-project.vercel.app` |
   | `SUBMITTER_HASH_SALT` | output of `openssl rand -hex 32` |
   | `ADMIN_TOKEN` | output of `openssl rand -hex 32` |
   | `GEO_BACKEND` | `auto` |

   Tick **Production**, **Preview** and **Development** for each.

   > **Adding environment variables does not rebuild anything.** Vercel bakes
   > them in at build time, so after saving you must redeploy:
   > Deployments → latest → ⋯ → **Redeploy**.
4. **Domain** — a subdomain of a domain you already own is free. Add a CNAME in
   Cloudflare DNS (set it to **DNS only**, not proxied, so Vercel can issue TLS).

---

## Alternative: Cloudflare Workers

You already have Cloudflare Workers + D1 set up, so it's worth saying plainly
why this isn't the default:

- **Workers is not Node.** Next.js needs the [OpenNext Cloudflare
  adapter](https://opennext.js.org/cloudflare) — workable, but another moving
  part.
- **The database driver changes.** `postgres.js` needs TCP; on Workers you'd
  connect through **Hyperdrive**, or switch to Neon's HTTP driver
  (`drizzle-orm/neon-http`). The HTTP driver does **not** support the
  interactive transactions this codebase uses in `submissions.ts`,
  `verification.ts` and `revisions.ts` — those would need rewriting as batched
  transactions.
- **D1 is SQLite, not Postgres.** No PostGIS, different dialect, and the
  generated columns and partial unique indexes would all need reworking. Not
  worth it for a geo app aiming at 50 states.

If you want to use Cloudflare anyway, the path is: OpenNext adapter +
Hyperdrive in front of Neon. Budget half a day, and keep `GEO_BACKEND=haversine`
until you've confirmed PostGIS works through Hyperdrive.

**Cloudflare is still the right home for two things**, whatever hosts the app:

- **R2** for menu-photo evidence (10 GB free, no egress fees) when that ships.
- **Protomaps tiles on R2** if CARTO's basemap ever becomes a limitation —
  a single `.pmtiles` file for the whole US, served for cents, with
  `NEXT_PUBLIC_MAP_STYLE_URL` pointed at it.

---

## Moderation escalation (optional, free)

To mirror moderation tasks as GitHub issues:

1. Create a **fine-grained PAT** scoped to `CydVilla/pour-finder` with
   **Issues: read & write**.
2. App environment:
   ```
   GITHUB_TOKEN=github_pat_YOUR_TOKEN_HERE
   GITHUB_REPO=CydVilla/pour-finder
   GITHUB_ISSUE_LABELS=pour-finder,data-review
   GITHUB_ISSUE_ASSIGNEES=            # add `Copilot` only if you have the paid agent
   MODERATION_WEBHOOK_SECRET=$(openssl rand -hex 32)
   ESCALATION_THRESHOLD=2
   ```
3. Repository **Actions secrets**:
   ```
   POUR_FINDER_WEBHOOK_URL     https://your-domain/api/webhooks/moderation
   POUR_FINDER_WEBHOOK_SECRET  same value as MODERATION_WEBHOOK_SECRET
   ```
4. Create the `pour-finder`, `data-review`, `deal-ended` and `venue-closed`
   labels (the API creates missing labels automatically on first use, but making
   them by hand lets you set colours).

Closing an issue as **completed** expires the deal; **not planned** dismisses
the reports. Both are logged as revisions.

> **Copilot caveat.** Assigning issues to the Copilot coding agent needs a paid
> Copilot plan (Pro/Pro+/Business/Enterprise) with the agent enabled for the
> repo. Without it, GitHub rejects the assignee — the integration retries once
> without assignees so the issue is still filed, and `/admin` does the same job.

---

## Operational notes

- **Rotate `SUBMITTER_HASH_SALT`** periodically. It un-links historical
  contributor hashes by design; you lose accumulated reputation, which is the
  intended privacy trade until real accounts exist.
- **`MODERATION_AUTO_APPROVE=true`** publishes submissions instantly. Reasonable
  while you're the only contributor seeding a market; turn it off before the
  site has open traffic.
- **Leave `ADMIN_TOKEN` unset** to disable `/admin` entirely rather than leaving
  it reachable.
- **Back up before every migration.** `deal_revisions` is the irreplaceable
  table — deals can be re-scraped, price history cannot.
