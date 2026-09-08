# ADR-0004: Unknown is a first-class value

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

A bar advertising "$1 drafts" genuinely does not tell you whether that is 7, 10,
12 or 16 ounces. Mike's Food & Spirits prints only "medium" and "large". The
obvious engineering instinct — pick a sensible default like 16 oz — would make
every price-per-ounce comparison on the site quietly wrong, and nothing in the
data would distinguish a guess from a measurement.

## Decision

Unknown is stored as unknown, everywhere:

- `serving_size_oz` is nullable and never defaulted.
- `serving_size_label` holds the menu's own wording ("medium", "liter").
- `price_per_ounce_cents` is a **generated column** that evaluates to `NULL`
  whenever total volume is unknown, so the "best value" sort structurally
  cannot invent a number.
- `geo_precision` records how much to trust a coordinate
  (`rooftop` / `approximate` / `city_centroid` / `unknown`).
- The submission form leaves size blank by default and says why.

## Consequences

**Good**

- Value comparisons are trustworthy because they only exist where the inputs do.
- The UI can be honest ("size unknown", "value unknown") instead of confidently
  wrong.
- Seed data records the actual state of the research rather than laundering it
  into false precision.

**Bad**

- A large fraction of real deals have no computable value, so "best value" sorts
  a minority of the corpus and pushes everything else to the end. This looks
  like a bug to users who don't read the labels.
- Every consumer of size has to handle `null`, which is more code than a
  default would be.
- `NULLS LAST` has to be specified explicitly in every ordering, and forgetting
  it silently reorders results.
