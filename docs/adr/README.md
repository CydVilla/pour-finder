# Architecture Decision Records

One file per decision that would be expensive to reverse, in
[Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

An ADR records *why* — the context at the time, what was rejected, and what the
decision costs. That last part matters most: every entry here has a
consequences section listing what it made worse, because a decision record with
only upsides is marketing, not engineering.

ADRs are immutable. When a decision changes, add a new ADR and mark the old one
`Superseded by ADR-NNNN`. Don't edit history.

| # | Decision | Status |
|---|---|---|
| [0001](0001-drizzle-over-prisma.md) | Drizzle over Prisma | Accepted |
| [0002](0002-pluggable-geo-backend.md) | Pluggable geo backend, haversine by default | Accepted |
| [0003](0003-maplibre-over-mapbox.md) | MapLibre over Mapbox | Accepted |
| [0004](0004-unknown-is-first-class.md) | Unknown is a first-class value | Accepted |
| [0005](0005-freshness-is-computed.md) | Freshness is computed, never stored | Accepted |
| [0006](0006-anonymous-contributions.md) | Anonymous contributions, no account wall | Accepted |
| [0007](0007-reports-never-auto-delist.md) | Community reports never auto-delist | Accepted |
| [0008](0008-two-query-discovery.md) | Two queries for discovery, not one | Accepted |
| [0009](0009-explicit-comment-signal.md) | Explicit comment signal over text inference | Accepted |
| [0010](0010-config-must-not-break-builds.md) | Configuration must not break builds | Accepted |
