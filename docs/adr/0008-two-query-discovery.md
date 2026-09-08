# ADR-0008: Two queries for discovery, not one

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

The discovery page needs a page of venues ranked by an aggregate over their
deals (cheapest price, best freshness, total confirmations), plus the matching
deals for each of those venues.

A single query either fans out rows (N deals × venue columns), which breaks
`LIMIT` because the limit applies to deal rows rather than venues, or needs a
lateral JSON aggregation that the planner handles badly once the corpus grows.

## Decision

Two round trips:

1. Rank and page **venues**, aggregating over their matching deals in a CTE.
2. Fetch matching deals for exactly that page of venue ids.

Both queries apply the identical `WHERE` clause, built once, so a venue matched
by a beer-name search returns only the matching deals.

## Consequences

**Good**

- `LIMIT` means what it says: N venues.
- Query 2 is bounded by the page size, never by the size of the result set.
- Both queries stay flat as the corpus grows.

**Bad**

- Two network round trips per page load instead of one.
- The `WHERE` clause is built once but interpolated twice, so a filter that is
  correct in one context and not the other would produce subtly inconsistent
  results. There is no test asserting the two stay in sync.
- Ordering deals *within* a venue has to separately mirror the venue sort, or
  the headline deal on a card contradicts the ranking (this was a real bug).
