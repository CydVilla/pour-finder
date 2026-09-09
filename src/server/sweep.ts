import "server-only";
import { list } from "@vercel/blob";
import { and, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { media, rateLimitEvents } from "@/db/schema";
import { activeProvider, deleteObject } from "./storage";

/**
 * Housekeeping.
 *
 * Two kinds of litter accumulate:
 *
 * 1. **Abandoned tickets.** A row is created before the bytes exist, so a user
 *    who picks a file and closes the tab leaves a `pending` row with no
 *    `uploaded_at`. Harmless, but it clutters the moderation queue's counts.
 *
 * 2. **Orphaned objects.** Worse: a client can finish the PUT and then fail to
 *    confirm, leaving bytes in storage that no database row references. Those
 *    cost money forever and nothing would ever find them again, so the sweep
 *    reconciles the bucket against the table rather than only trimming rows.
 *
 * Objects newer than the grace period are always left alone — an upload in
 * flight has no confirmed row yet and must not be collected.
 */
const TICKET_GRACE_HOURS = 24;
const OBJECT_GRACE_HOURS = 6;

export interface SweepResult {
  abandonedTickets: number;
  orphanedObjects: number;
  rateLimitRows: number;
  scannedObjects: number;
  notes: string[];
}

export async function runSweep(): Promise<SweepResult> {
  const notes: string[] = [];

  const ticketCutoff = new Date(Date.now() - TICKET_GRACE_HOURS * 3_600_000);
  const abandoned = await db
    .delete(media)
    .where(and(isNull(media.uploadedAt), lt(media.createdAt, ticketCutoff)))
    .returning({ id: media.id });

  const rateLimitRows = await db
    .delete(rateLimitEvents)
    .where(lt(rateLimitEvents.createdAt, new Date(Date.now() - 86_400_000)))
    .returning({ id: rateLimitEvents.id });

  let orphanedObjects = 0;
  let scannedObjects = 0;

  if (activeProvider() === "vercel-blob") {
    try {
      const known = new Set(
        (
          (await db.execute(sql`
            SELECT public_url FROM media WHERE public_url IS NOT NULL
            UNION ALL
            SELECT thumbnail_url FROM media WHERE thumbnail_url IS NOT NULL
          `)) as unknown as { public_url: string }[]
        ).map((row) => row.public_url),
      );

      const objectCutoff = Date.now() - OBJECT_GRACE_HOURS * 3_600_000;
      let cursor: string | undefined;

      do {
        const page = await list({ cursor, limit: 1000 });
        cursor = page.cursor;
        scannedObjects += page.blobs.length;

        for (const blob of page.blobs) {
          if (known.has(blob.url)) continue;
          if (new Date(blob.uploadedAt).getTime() > objectCutoff) continue;
          await deleteObject(blob.url);
          orphanedObjects += 1;
        }
      } while (cursor);
    } catch (error) {
      notes.push(
        `object reconciliation skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    // Listing an S3 bucket page by page is the same shape, but R2 isn't the
    // active provider yet so it would be untested code.
    notes.push("object reconciliation runs on the Vercel Blob provider only");
  }

  return {
    abandonedTickets: abandoned.length,
    orphanedObjects,
    rateLimitRows: rateLimitRows.length,
    scannedObjects,
    notes,
  };
}
