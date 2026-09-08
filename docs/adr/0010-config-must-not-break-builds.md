# ADR-0010: Configuration must not break builds

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

This ADR exists because of a production incident: the first three deploys of
this project failed, for two independent configuration-handling bugs.

1. The Postgres client was created at module scope. `next build` imports every
   route module to collect page data, so a missing `DATABASE_URL` failed the
   **build** rather than producing a clear runtime error. A build does not need
   a database.
2. Environment variables were read as `process.env.X ?? fallback`. `??` only
   catches `undefined`, but unset variables frequently arrive as empty strings —
   and Next.js inlines missing `NEXT_PUBLIC_*` variables as `''` at build time.
   So `NEXT_PUBLIC_SITE_URL` became `''`, and `new URL('')` threw during
   page-data collection with `ERR_INVALID_URL`.

The same sweep found `DATABASE_POOL_MAX=""` parsing via `Number()` to `0` — a
connection pool that can never open a connection.

## Decision

1. **Nothing connects at import time.** The database client and the Drizzle
   instance are created lazily on first query, behind a proxy.
2. **All environment reads go through `src/lib/env.ts`**, where empty and
   whitespace-only both count as unset (`envString` / `envBool` / `envInt`).
3. **Configuration that is merely cosmetic degrades rather than throws.**
   `siteUrl()` validates and falls back to localhost with a warning; metadata is
   not worth a failed deploy.
4. **The app must build and boot with zero environment variables**, serving its
   empty state and a clear error in the logs. This is verified before release.

## Consequences

**Good**

- A missing or wrong variable produces an actionable runtime message instead of
  an opaque build failure at an unrelated route.
- Preview deploys and CI work without secrets.
- `npm run db:check` diagnoses connection strings without printing them.

**Bad**

- The lazy `db` is a `Proxy`, so stack traces from Drizzle internals are one
  frame further from the call site, and any future Drizzle feature relying on
  private class fields would break through it.
- Degrading instead of failing means a genuinely misconfigured production
  deploy can look healthy: the site returns 200 with an empty state. The signal
  moved from the build log to the runtime log, which is easier to miss.
- Every new environment variable now has an import and a helper call rather
  than being a one-liner, which is friction that invites shortcuts.
