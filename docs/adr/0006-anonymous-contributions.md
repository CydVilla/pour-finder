# ADR-0006: Anonymous contributions, no account wall

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

Contribution volume *is* the product. A beer-price database with no recent
confirmations is worse than useless — it is actively misleading.

The decision is whether to require an account before someone can say "yes, it's
still $1". Requiring one gives durable identity, real reputation and better
abuse resistance. It also asks somebody standing in a bar, slightly drunk, to
complete a signup flow before they can help. Most will not.

## Decision

**No account required for anything**, including submissions and verifications.

Anonymous identity is `sha256(ip + user-agent + rotating salt)`, truncated. No
raw IP is ever stored. It is deliberately weak: strong enough to rate limit and
to enforce one vote per person per deal per day, not strong enough to track
anybody.

`contributors.userId` and `userId` columns on comments, verifications and
submissions exist from day one, so accounts become a join rather than a
migration.

## Consequences

**Good**

- The one-tap confirmation is genuinely one tap. This is the highest-value
  interaction on the site and it has zero friction.
- No password storage, no account recovery, no PII beyond a salted hash.
- Rotating `SUBMITTER_HASH_SALT` un-links all historical identity by design.

**Bad**

- Reputation cannot accumulate meaningfully — `contributors.trustScore` is a
  flat 50 and will stay that way until accounts exist.
- Shared IPs (a bar's wifi, a carrier NAT) collapse many people into one
  identity, so the per-day vote limit can block legitimate contributors.
- Rotating the salt destroys the accumulated contributor history that a
  reputation model would need. The privacy win and the reputation goal are in
  direct tension, unresolved.
- Abuse resistance rests entirely on rate limiting and moderation rather than
  on identity.
