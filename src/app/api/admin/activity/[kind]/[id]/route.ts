import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, deals, media, venues } from "@/db/schema";
import { isAdminRequest } from "@/server/admin";
import { jsonError, jsonOk, readJson, zodError } from "@/server/http";
import { reviewMedia } from "@/server/media";
import { recordDealRevision, recordVenueRevision } from "@/server/revisions";

/**
 * Undo, for the auto-approve workflow.
 *
 * Publishing without review is only safe if taking something down is as easy
 * as it going up. Every action here is reversible-in-spirit rather than a
 * delete: deals are expired, venues are closed, comments are hidden — all of
 * which preserve the row and its history. Media is the exception, because
 * keeping rejected image bytes costs money and creates liability.
 */
const schema = z.object({
  action: z.enum(["remove"]),
  note: z.string().trim().max(300).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  if (!isAdminRequest(request)) return jsonError("Not authorized", 401);

  const { kind, id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Unknown item", 404);

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);
  const note = parsed.data.note ?? "Removed by moderator after publication";

  switch (kind) {
    case "deal": {
      const done = await db.transaction(async (tx) => {
        const [previous] = await tx.select().from(deals).where(eq(deals.id, id)).limit(1);
        if (!previous) return false;
        const [updated] = await tx
          .update(deals)
          .set({ status: "removed", endedAt: new Date(), endedReason: note, updatedAt: new Date() })
          .where(eq(deals.id, id))
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
        return Boolean(updated);
      });
      return done ? jsonOk({ ok: true }) : jsonError("Unknown deal", 404);
    }

    case "venue": {
      const done = await db.transaction(async (tx) => {
        const [previous] = await tx.select().from(venues).where(eq(venues.id, id)).limit(1);
        if (!previous) return false;
        const [updated] = await tx
          .update(venues)
          .set({ status: "permanently_closed", notes: note, updatedAt: new Date() })
          .where(eq(venues.id, id))
          .returning();
        if (updated) {
          await recordVenueRevision(tx, {
            venue: updated,
            previous,
            changeType: "moderation",
            actor: "moderator",
            note,
          });
          // Its deals go with it, but nothing is deleted.
          await tx
            .update(deals)
            .set({ status: "removed", endedAt: new Date(), endedReason: note, updatedAt: new Date() })
            .where(and(eq(deals.venueId, id), eq(deals.status, "active")));
        }
        return Boolean(updated);
      });
      return done ? jsonOk({ ok: true }) : jsonError("Unknown venue", 404);
    }

    case "media":
      return (await reviewMedia(id, "reject", "moderator", note))
        ? jsonOk({ ok: true })
        : jsonError("Unknown upload", 404);

    case "comment": {
      const [row] = await db
        .update(comments)
        .set({ status: "hidden", moderatedAt: new Date(), moderatedBy: "moderator" })
        .where(eq(comments.id, id))
        .returning();
      return row ? jsonOk({ ok: true }) : jsonError("Unknown comment", 404);
    }

    default:
      return jsonError("Unknown item type", 400);
  }
}
