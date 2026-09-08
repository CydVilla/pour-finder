# ADR-0001: Drizzle over Prisma

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

The project needs a TypeScript ORM. Prisma is the default choice in this
ecosystem and was the initial preference.

Three things in this schema are load-bearing and none are expressible in Prisma
without escape hatches:

1. `geography(Point,4326)` for the PostGIS geo backend. Prisma models it as
   `Unsupported("geography")`, which cannot be selected or filtered in the
   generated client.
2. `price_per_ounce_cents` as a **generated column**. The value calculation has
   to live in the database so that sorting by it is indexable and can never
   disagree with what's rendered. Prisma has no generated-column support.
3. **Partial unique indexes.** "One verification per person per deal per day"
   and "one open moderation task per deal per kind" are enforced by the
   database. Application-level checks lose to a race; a partial unique index
   does not.

## Decision

Use **Drizzle ORM**.

## Consequences

**Good**

- All three constraints above are expressible directly.
- No query-engine binary, so serverless cold starts stay cheap.
- Raw SQL via the `sql` template is first-class, which the discovery query
  needs (window functions, CTEs, correlated subqueries).

**Bad**

- Smaller ecosystem than Prisma; fewer tutorials, fewer third-party tools.
- No equivalent of Prisma Studio's maturity (`drizzle-kit studio` is thinner).
- Drizzle's typed query builder is less ergonomic for deep relational reads, so
  the discovery query is hand-written SQL. That is *more* readable here, but it
  means the type system verifies less of it — the row shapes in
  `deals-query.ts` are hand-declared interfaces, and a schema change that
  doesn't update them will compile and fail at runtime.
- Drizzle's `sql` template creates bind parameters whose Postgres type is
  inferred from context. This bit us: a float Earth-radius constant was
  inferred as `integer` and broke every distance query until casts were added
  explicitly. Any numeric literal in raw SQL now carries a `::` cast.
