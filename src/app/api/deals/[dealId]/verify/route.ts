import type { NextRequest } from "next/server";
import { verificationSchema } from "@/lib/submission-schemas";
import { jsonError, jsonOk, rateLimited, readJson, zodError } from "@/server/http";
import { submitterHashFromRequest } from "@/server/identity";
import { consumeRateLimit } from "@/server/rate-limit";
import { recordVerification } from "@/server/verification";

/**
 * "Still available" / "No longer available".
 *
 * Applies immediately - this is the one community action that does not queue,
 * because the entire value of the freshness badge is that it updates the
 * moment somebody standing at the bar taps it.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return jsonError("Unknown deal", 404);

  const body = await readJson(request);
  const parsed = verificationSchema.safeParse(body ?? {});
  if (!parsed.success) return zodError(parsed.error);

  const submitterHash = submitterHashFromRequest(request);
  const limit = await consumeRateLimit(submitterHash, "verify");
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const result = await recordVerification({
    dealId,
    result: parsed.data.result,
    submitterHash,
    note: parsed.data.note ?? null,
    reportedPriceCents: parsed.data.reportedPriceCents ?? null,
  });

  if ("ok" in result && result.ok === false) {
    return jsonError("That deal no longer exists", 404);
  }

  return jsonOk(result);
}
