import type { NextRequest } from "next/server";
import { db } from "@/db";
import { dealReports } from "@/db/schema";
import { reportSchema } from "@/lib/submission-schemas";
import { jsonError, jsonOk, rateLimited, readJson, zodError } from "@/server/http";
import { dayBucket, submitterHashFromRequest } from "@/server/identity";
import { consumeRateLimit } from "@/server/rate-limit";

/**
 * Report an incorrect deal.
 *
 * Reports NEVER change the deal. They queue for a human. Auto-acting on
 * reports would hand any competitor a delete button; the cost of a wrong deal
 * staying up for a day is far lower than the cost of correct deals being
 * removable by three anonymous taps.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return jsonError("Unknown deal", 404);

  const body = await readJson(request);
  const parsed = reportSchema.safeParse(body ?? {});
  if (!parsed.success) return zodError(parsed.error);

  const submitterHash = submitterHashFromRequest(request);
  const limit = await consumeRateLimit(submitterHash, "report");
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  try {
    await db
      .insert(dealReports)
      .values({
        dealId,
        reason: parsed.data.reason,
        note: parsed.data.note ?? null,
        submitterHash,
        dayBucket: dayBucket(),
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error("[api/report] insert failed", error);
    return jsonError("Could not file that report", 500);
  }

  return jsonOk({
    ok: true as const,
    message: "Thanks — a moderator will take a look.",
  });
}
