import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { deals, moderationTasks, venues } from "@/db/schema";
import { isAdminRequest } from "@/server/admin";
import { jsonError, jsonOk, readJson, zodError } from "@/server/http";
import { recordDealRevision, recordVenueRevision } from "@/server/revisions";

const schema = z.object({
  decision: z.enum(["apply", "dismiss"]),
  note: z.string().trim().max(500).optional(),
});

/**
 * Same effect as the GitHub round-trip, from the built-in queue. Both paths
 * funnel through the same revision-recording writes so history is identical
 * regardless of where the decision was made.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("Not authorized", 401);

  const { id } = await context.params;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const [task] = await db.select().from(moderationTasks).where(eq(moderationTasks.id, id)).limit(1);
  if (!task) return jsonError("Unknown task", 404);
  if (task.status === "resolved" || task.status === "dismissed") {
    return jsonOk({ ok: true, alreadyHandled: true });
  }

  const note = parsed.data.note ?? task.reason;

  if (parsed.data.decision === "dismiss") {
    await db
      .update(moderationTasks)
      .set({
        status: "dismissed",
        resolution: note,
        resolvedAt: new Date(),
        resolvedBy: "moderator",
        updatedAt: new Date(),
      })
      .where(eq(moderationTasks.id, id));
    return jsonOk({ ok: true, applied: false });
  }

  await db.transaction(async (tx) => {
    if (task.kind === "deal_possibly_ended" && task.dealId) {
      const [previous] = await tx.select().from(deals).where(eq(deals.id, task.dealId)).limit(1);
      if (previous) {
        const [updated] = await tx
          .update(deals)
          .set({ status: "expired", endedAt: new Date(), endedReason: note, updatedAt: new Date() })
          .where(eq(deals.id, task.dealId))
          .returning();
        if (updated) {
          await recordDealRevision(tx, {
            deal: updated,
            previous,
            changeType: "moderation",
            actor: "moderator",
            note,
          });
        }
      }
    }

    if (task.kind === "venue_possibly_closed" && task.venueId) {
      const [previous] = await tx.select().from(venues).where(eq(venues.id, task.venueId)).limit(1);
      if (previous) {
        const [updated] = await tx
          .update(venues)
          .set({ status: "permanently_closed", updatedAt: new Date() })
          .where(eq(venues.id, task.venueId))
          .returning();
        if (updated) {
          await recordVenueRevision(tx, {
            venue: updated,
            previous,
            changeType: "moderation",
            actor: "moderator",
            note,
          });
          await tx
            .update(deals)
            .set({
              status: "expired",
              endedAt: new Date(),
              endedReason: "Venue permanently closed",
              updatedAt: new Date(),
            })
            .where(and(eq(deals.venueId, task.venueId), eq(deals.status, "active")));
        }
      }
    }

    await tx
      .update(moderationTasks)
      .set({
        status: "resolved",
        resolution: note,
        resolvedAt: new Date(),
        resolvedBy: "moderator",
        updatedAt: new Date(),
      })
      .where(eq(moderationTasks.id, id));
  });

  return jsonOk({ ok: true, applied: true });
}
