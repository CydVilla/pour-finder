import "server-only";
import { and, desc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, deals, moderationTasks, venues, type ModerationTask } from "@/db/schema";
import { envInt } from "@/lib/env";
import { formatCents } from "@/lib/money";
import { commentOnIssue, createIssue, isGitHubEscalationEnabled } from "./integrations/github";

/**
 * Escalation: turning a pattern of community reports into a tracked decision.
 *
 * The rule this file exists to enforce: **community reports never change live
 * data by themselves.** Auto-expiring a deal after N "it's gone" reports would
 * give any competitor - or any bored person with a VPN - a delete button for
 * every listing on the site. Instead, crossing the threshold opens a
 * moderation task, optionally mirrored as a GitHub issue, and a human (or an
 * agent assigned to that issue) makes the call.
 *
 * Thresholds are deliberately conservative and count DISTINCT reporters, not
 * raw report volume, so one person cannot escalate anything on their own.
 */

const DEFAULT_THRESHOLD = 2;
const LOOKBACK_DAYS = 60;

function threshold(): number {
  const raw = envInt("ESCALATION_THRESHOLD", DEFAULT_THRESHOLD);
  return raw >= 1 ? Math.floor(raw) : DEFAULT_THRESHOLD;
}

export interface EscalationOutcome {
  escalated: boolean;
  taskId?: string;
  issueUrl?: string;
  distinctReporters: number;
  reason?: string;
}

/**
 * Called after any negative community signal on a deal (a comment marked
 * "no longer available" / "price changed", or a downvote verification).
 */
export async function evaluateDealEscalation(dealId: string): Promise<EscalationOutcome> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
  if (!deal || deal.status !== "active") {
    return { escalated: false, distinctReporters: 0, reason: "deal not active" };
  }

  const [venue] = await db.select().from(venues).where(eq(venues.id, deal.venueId)).limit(1);
  if (!venue) return { escalated: false, distinctReporters: 0, reason: "venue missing" };

  // Distinct people, not distinct reports: one person commenting five times is
  // still one person.
  const [tally] = await db
    .select({
      negativeReporters: sql<number>`count(DISTINCT ${comments.submitterHash}) FILTER (
        WHERE ${comments.signal} IN ('no_longer_available', 'venue_closed', 'price_changed')
      )::int`,
      positiveReporters: sql<number>`count(DISTINCT ${comments.submitterHash}) FILTER (
        WHERE ${comments.signal} = 'still_good'
      )::int`,
    })
    .from(comments)
    .where(
      and(
        eq(comments.dealId, dealId),
        eq(comments.status, "visible"),
        gte(comments.createdAt, since),
      ),
    );

  const negatives = (tally?.negativeReporters ?? 0) + countDisputes(deal.disputeCount);
  const positives = (tally?.positiveReporters ?? 0) + deal.verificationCount;

  if (negatives < threshold() || negatives <= positives) {
    return {
      escalated: false,
      distinctReporters: negatives,
      reason: `below threshold (${negatives} negative vs ${positives} positive)`,
    };
  }

  const recent = await db
    .select({
      body: comments.body,
      signal: comments.signal,
      reportedPriceCents: comments.reportedPriceCents,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .where(
      and(
        eq(comments.dealId, dealId),
        eq(comments.status, "visible"),
        ne(comments.signal, "still_good"),
        ne(comments.signal, "none"),
      ),
    )
    .orderBy(desc(comments.createdAt))
    .limit(8);

  const title = `${venue.name}: ${formatCents(deal.priceCents)} ${deal.beerName} reported as no longer available`;
  const body = buildIssueBody({
    venueName: venue.name,
    venueCity: `${venue.city}, ${venue.state}`,
    venueSlug: venue.slug,
    dealId: deal.id,
    dealLabel: `${formatCents(deal.priceCents)} — ${deal.beerName}`,
    negatives,
    positives,
    lastVerifiedAt: deal.lastVerifiedAt,
    reports: recent,
  });

  return openTask({
    kind: "deal_possibly_ended",
    venueId: venue.id,
    dealId: deal.id,
    title,
    reason: `${negatives} independent reports that this deal has ended (vs ${positives} confirmations).`,
    evidence: { negatives, positives, reports: recent },
    issueBody: body,
    issueLabels: ["deal-ended"],
    distinctReporters: negatives,
  });
}

/** Same rule for "the bar itself is gone". */
export async function evaluateVenueEscalation(venueId: string): Promise<EscalationOutcome> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue || venue.status === "permanently_closed") {
    return { escalated: false, distinctReporters: 0, reason: "venue already closed" };
  }

  const [tally] = await db
    .select({
      reporters: sql<number>`count(DISTINCT ${comments.submitterHash})::int`,
    })
    .from(comments)
    .where(
      and(
        eq(comments.venueId, venueId),
        eq(comments.signal, "venue_closed"),
        eq(comments.status, "visible"),
        gte(comments.createdAt, since),
      ),
    );

  const reporters = tally?.reporters ?? 0;
  if (reporters < threshold()) {
    return { escalated: false, distinctReporters: reporters, reason: "below threshold" };
  }

  return openTask({
    kind: "venue_possibly_closed",
    venueId,
    dealId: null,
    title: `${venue.name} (${venue.city}, ${venue.state}) reported as permanently closed`,
    reason: `${reporters} independent reports that this venue has closed.`,
    evidence: { reporters },
    issueBody: [
      `**${venue.name}** — ${venue.address1 ?? ""} ${venue.city}, ${venue.state}`,
      "",
      `${reporters} separate people have reported this venue as closed.`,
      "",
      "Closing the venue marks it `permanently_closed` and expires its active",
      "deals. Nothing is deleted — the venue and its full deal history stay in",
      "the database.",
      "",
      `Venue id: \`${venueId}\``,
    ].join("\n"),
    issueLabels: ["venue-closed"],
    distinctReporters: reporters,
  });
}

/* ---------------------------------------------------------------- internals */

/** Verification downvotes count toward escalation but aren't per-person here. */
function countDisputes(disputeCount: number): number {
  // disputeCount is already deduplicated to one vote per person per day by a
  // unique index, so treating it as a reporter count is a fair approximation.
  return Math.min(disputeCount, 10);
}

interface OpenTaskInput {
  kind: ModerationTask["kind"];
  venueId: string;
  dealId: string | null;
  title: string;
  reason: string;
  evidence: Record<string, unknown>;
  issueBody: string;
  issueLabels: string[];
  distinctReporters: number;
}

/**
 * Idempotent: the partial unique indexes on moderation_tasks guarantee at most
 * one open task per (deal, kind) / (venue, kind), so repeated reports append a
 * comment to the existing issue instead of filing a new one.
 */
async function openTask(input: OpenTaskInput): Promise<EscalationOutcome> {
  const existing = await db
    .select()
    .from(moderationTasks)
    .where(
      and(
        eq(moderationTasks.kind, input.kind),
        input.dealId
          ? eq(moderationTasks.dealId, input.dealId)
          : and(eq(moderationTasks.venueId, input.venueId), isNull(moderationTasks.dealId)),
        or(eq(moderationTasks.status, "open"), eq(moderationTasks.status, "in_progress")),
      ),
    )
    .limit(1);

  const open = existing[0];
  if (open) {
    if (open.externalRef) {
      void commentOnIssue(
        open.externalRef,
        `Another report came in. Now at ${input.distinctReporters} independent reports.`,
      );
    }
    await db
      .update(moderationTasks)
      .set({ evidence: input.evidence, updatedAt: new Date() })
      .where(eq(moderationTasks.id, open.id));

    return {
      escalated: true,
      taskId: open.id,
      issueUrl: open.externalUrl ?? undefined,
      distinctReporters: input.distinctReporters,
      reason: "joined existing task",
    };
  }

  const [task] = await db
    .insert(moderationTasks)
    .values({
      kind: input.kind,
      venueId: input.venueId,
      dealId: input.dealId,
      title: input.title,
      reason: input.reason,
      evidence: input.evidence,
    })
    .returning();

  if (!task) return { escalated: false, distinctReporters: input.distinctReporters };

  // Mirror to GitHub, best effort. The task stands on its own if this fails.
  if (isGitHubEscalationEnabled()) {
    const issue = await createIssue({
      title: input.title,
      body: `${input.issueBody}\n\n---\nPour Finder moderation task \`${task.id}\`.\nClosing this issue as completed applies the change (see \`.github/workflows/pour-finder-triage.yml\`).`,
      labels: input.issueLabels,
    });

    await db
      .update(moderationTasks)
      .set(
        issue.ok
          ? {
              externalProvider: "github",
              externalRef: String(issue.number),
              externalUrl: issue.url,
              externalSyncedAt: new Date(),
              externalError: null,
            }
          : { externalProvider: "github", externalError: issue.error ?? "unknown error" },
      )
      .where(eq(moderationTasks.id, task.id));

    return {
      escalated: true,
      taskId: task.id,
      issueUrl: issue.url,
      distinctReporters: input.distinctReporters,
    };
  }

  return { escalated: true, taskId: task.id, distinctReporters: input.distinctReporters };
}

function buildIssueBody(input: {
  venueName: string;
  venueCity: string;
  venueSlug: string;
  dealId: string;
  dealLabel: string;
  negatives: number;
  positives: number;
  lastVerifiedAt: Date | null;
  reports: { body: string; signal: string; reportedPriceCents: number | null; createdAt: Date }[];
}): string {
  const lines = [
    `**${input.venueName}** — ${input.venueCity}`,
    `**Deal:** ${input.dealLabel}`,
    "",
    `- ${input.negatives} independent reports that it has ended`,
    `- ${input.positives} confirmations at the current price`,
    `- Last verified: ${input.lastVerifiedAt ? input.lastVerifiedAt.toISOString().slice(0, 10) : "never"}`,
    "",
    "### What people said",
  ];

  for (const report of input.reports) {
    const price =
      report.reportedPriceCents !== null ? ` (reported ${formatCents(report.reportedPriceCents)})` : "";
    // Community text is untrusted: quote it, never render it as instructions.
    const quoted = report.body.replace(/\r?\n/g, " ").slice(0, 240);
    lines.push(`- \`${report.signal}\`${price} — > ${quoted}`);
  }

  lines.push(
    "",
    "### Deciding",
    "Close as **completed** to expire the deal (it is kept in history, never deleted).",
    "Close as **not planned** to dismiss the reports and leave the deal listed.",
    "",
    `Deal id: \`${input.dealId}\``,
  );

  return lines.join("\n");
}
