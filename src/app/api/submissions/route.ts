import type { NextRequest } from "next/server";
import { submissionSchema, validateDealTarget } from "@/lib/submission-schemas";
import { jsonError, jsonOk, rateLimited, readJson, zodError } from "@/server/http";
import { submitterHashFromRequest } from "@/server/identity";
import { consumeRateLimit } from "@/server/rate-limit";
import { createSubmission } from "@/server/submissions";

/**
 * Every community write that changes authoritative data.
 *
 * Anonymous by design. Requiring an account before someone can tell us a beer
 * costs $2 would cut contributions to a fraction, and contribution volume is
 * the entire product. Rate limiting plus a moderation queue plus per-day
 * uniqueness gets us the same abuse resistance without the signup wall, and
 * `contributors.userId` is already there for when accounts land.
 */
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (body === null) return jsonError("Expected a JSON body", 400);

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const targetError = validateDealTarget(parsed.data);
  if (targetError) return jsonError(targetError, 422);

  const submitterHash = submitterHashFromRequest(request);
  const limit = await consumeRateLimit(submitterHash, "submit");
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  try {
    const result = await createSubmission(parsed.data, submitterHash);
    return jsonOk(result, { status: 201 });
  } catch (error) {
    console.error("[api/submissions] failed", error);
    return jsonError("Could not save that submission", 500);
  }
}
