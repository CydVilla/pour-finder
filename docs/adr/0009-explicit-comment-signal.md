# ADR-0009: Explicit comment signal over text inference

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

Comments need to feed the escalation model — we need to know whether a comment
says "still there" or "it's gone". The obvious approach is to infer it from the
text, by keywords or by a model.

Keyword inference fails in exactly the cases that matter most:

> "no longer $5, it's $4 now"

Every negative keyword fires. The comment is good news. Acting on that
inference delists a real, cheaper deal.

## Decision

The commenter picks a **status** explicitly — *Still there*, *Price changed*,
*Deal is gone*, *Bar has closed*, *Just a note* — stored as
`comments.signal`. Only that structured value feeds escalation.

A keyword scan still runs, but only to set `needs_review` when the prose looks
negative and the chosen signal does not. It never escalates on its own.

## Consequences

**Good**

- The escalation input is structured data, not a guess.
- The status chips double as a prompt, so comments are more useful than free
  text alone would be.
- No model, no inference cost, no drift.

**Bad**

- One more decision in the way of leaving a comment; some people will pick the
  default rather than the truth, biasing the signal.
- Five options is already close to too many for a mobile bottom sheet.
- Prose contradicting the chosen signal is only flagged, never resolved, so the
  `needs_review` queue will accumulate items nobody has time to triage.
- Adding a new signal type later means a schema enum migration.
