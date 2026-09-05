import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { deals, moderationTasks, venues } from "@/db/schema";
import { jsonError, jsonOk } from "@/server/http";
import { recordDealRevision, recordVenueRevision } from "@/server/revisions";

/**
 * Round-trip from the external tracker back into the database.
 *
 * A GitHub Action fires this when a moderation issue is closed (see
 * .github/workflows/pour-finder-triage.yml). This is the ONLY path by which an
 * outside system can change live data, and it is deliberately narrow:
 *
 *  - HMAC-signed with a shared secret, compared in constant time.
 *  - Accepts exactly two decisions: apply, or dismiss.
 *  - Acts only on a task that already exists and is still open - so a replayed
 *    or forged payload cannot invent a change out of nothing.
 *  - Never deletes. "Apply" expires a deal or closes a venue; the rows and
 *    their full revision history stay queryable.
 */
const payloadSchema = z.object({
  taskId: z.string().uuid(),
  decision: z.enum(["apply", "dismiss"]),
  actor: z.string().max(120).default("github"),
  note: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const secret = process.env.MODERATION_WEBHOOK_SECRET;
  if (!secret || secret.length < 16) return jsonError("Webhook is not configured", 404);

  const raw = await request.text();
  const signature = request.headers.get("x-pour-finder-signature");
  if (!signature || !verifySignature(raw, signature, secret)) {
    return jsonError("Bad signature", 401);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return jsonError("Expected JSON", 400);
  }

  const parsed = payloadSchema.safeParse(parsedBody);
  if (!parsed.success) return jsonError("Invalid payload", 422);

  const { taskId, decision, actor, note } = parsed.data;

  const [task] = await db
    .select()
    .from(moderationTasks)
    .where(eq(moderationTasks.id, taskId))
    .limit(1);

  if (!task) return jsonError("Unknown task", 404);
  if (task.status === "resolved" || task.status === "dismissed") {
    return jsonOk({ ok: true, alreadyHandled: true, status: task.status });
  }

  if (decision === "dismiss") {
    await db
      .update(moderationTasks)
      .set({
        status: "dismissed",
        resolution: note ?? "Dismissed via tracker",
        resolvedAt: new Date(),
        resolvedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(moderationTasks.id, taskId));
    return jsonOk({ ok: true, applied: false });
  }

  await db.transaction(async (tx) => {
    if (task.kind === "deal_possibly_ended" && task.dealId) {
      const [previous] = await tx.select().from(deals).where(eq(deals.id, task.dealId)).limit(1);
      if (previous) {
        const [updated] = await tx
          .update(deals)
          .set({
            status: "expired",
            endedAt: new Date(),
            endedReason: note ?? task.reason,
            updatedAt: new Date(),
          })
          .where(eq(deals.id, task.dealId))
          .returning();
        if (updated) {
          await recordDealRevision(tx, {
            deal: updated,
            previous,
            changeType: "moderation",
            actor,
            note: note ?? task.reason,
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
            actor,
            note: note ?? task.reason,
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
        resolution: note ?? "Applied via tracker",
        resolvedAt: new Date(),
        resolvedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(moderationTasks.id, taskId));
  });

  return jsonOk({ ok: true, applied: true });
}

function verifySignature(body: string, provided: string, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
