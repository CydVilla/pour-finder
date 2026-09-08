# ADR-0007: Community reports never auto-delist

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

When several people report that a deal has ended, the tempting design is to
expire it automatically. It is responsive, it needs no moderator, and it keeps
the data clean.

It also hands every competing bar — and every bored person with a VPN — a
three-tap delete button for every listing on the site. The cost asymmetry is
severe: a wrong deal staying up for a day mildly annoys one person, while a
correct deal being deleted removes the thing the site exists to provide, and
nobody notices it's gone.

## Decision

Crossing the report threshold opens a **`moderation_task`** — a decision for a
human — and changes nothing about the listing.

The threshold counts **distinct reporters**, not report volume, so one person
cannot escalate anything alone. Negatives must also *outnumber* recent
confirmations, so a well-confirmed deal is not escalated by two complaints.

Optionally the task is mirrored to a GitHub issue; closing that issue applies
the decision through an HMAC-signed, replay-safe callback. The tracker is a
mirror, never an authority — the database is the source of truth.

## Consequences

**Good**

- Vandalising a listing requires compromising a moderator, not spoofing two IPs.
- Every delisting has an actor, a timestamp and a reason in `deal_revisions`.
- Disputes still surface to readers immediately (`disputeCount`, lower
  confidence), so bad data is visibly flagged even before a human acts.

**Bad**

- Wrong data persists until a human acts. With one operator, that could be days.
- It does not scale: moderation load grows linearly with traffic, and there is
  no plan yet for what happens past one person's capacity.
- The threshold (2 distinct reporters) is a guess with no data behind it.
- A determined attacker with several IPs can still generate moderation *noise*,
  even if they cannot delete anything.
