import type { NextRequest } from "next/server";
import { uploadTicketSchema } from "@/lib/submission-schemas";
import { MEDIA_LIMITS, formatBytes } from "@/lib/media-limits";
import { createUploadTicket } from "@/server/media";
import { jsonError, jsonOk, rateLimited, readJson, zodError } from "@/server/http";
import { submitterHashFromRequest } from "@/server/identity";
import { consumeRateLimit } from "@/server/rate-limit";

/**
 * Issues a short-lived, direct-to-storage upload URL.
 *
 * The browser uploads straight to the bucket so the app never carries the
 * bytes — which is what makes video viable at all on serverless.
 */
export async function POST(request: NextRequest) {
  const parsed = uploadTicketSchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const submitterHash = submitterHashFromRequest(request);
  const limit = await consumeRateLimit(submitterHash, "upload");
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const result = await createUploadTicket({ ...parsed.data, submitterHash });

  if ("error" in result) {
    switch (result.error) {
      case "storage_unconfigured":
        return jsonError("Photo and video uploads aren't switched on yet.", 503);
      case "unsupported_type":
        return jsonError(
          `That file type isn't supported. ${MEDIA_LIMITS.photo.hint}; video: ${MEDIA_LIMITS.video.hint}.`,
          415,
        );
      case "too_large":
        return jsonError(`That file is too big — the limit is ${formatBytes(result.maxBytes)}.`, 413);
      case "unknown_venue":
        return jsonError("That venue doesn't exist.", 404);
      case "unknown_deal":
        return jsonError("That deal doesn't belong to this venue.", 400);
    }
  }

  return jsonOk(result, { status: 201 });
}
