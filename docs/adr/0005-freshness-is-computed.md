# ADR-0005: Freshness is computed, never stored

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

The site's entire value proposition is "this price was confirmed 3 days ago".
Freshness is therefore the most correctness-critical derived value in the
product.

The conventional approach is a stored flag (`is_fresh`, `freshness_tier`)
maintained by a scheduled job. That flag is wrong from the moment the job fails
to run, and nothing surfaces the failure — the site keeps confidently showing
"Verified today" on year-old data.

## Decision

Freshness is a SQL `CASE` over `last_verified_at`, evaluated per query. The day
thresholds live once in `src/lib/freshness.ts` and are interpolated into the SQL
in `src/server/sql-fragments.ts`, so the badge, the filter and the sort ranking
are guaranteed to agree.

Deals are never auto-deleted for being stale; they visibly degrade instead.

## Consequences

**Good**

- Freshness cannot rot. There is no job to fail.
- Changing a threshold is a one-line change that updates display, filtering and
  ranking atomically.

**Bad**

- Arithmetic on every row of every query, and `last_verified_at` cannot be used
  for a covering index on the freshness *tier*.
- The confidence score is likewise computed per row, in TypeScript, after the
  query — so "most confirmed" sorting cannot use it and sorts on the raw
  confirmation count instead.
- At hundreds of thousands of deals this will need materialising into a column
  with a refresh job — reintroducing exactly the staleness risk this ADR avoids,
  but by then with enough traffic to notice.
