import type { NextRequest } from "next/server";
import { commentSchema } from "@/lib/submission-schemas";
import { listComments, postComment } from "@/server/comments";
import { jsonError, jsonOk, rateLimited, readJson, zodError } from "@/server/http";
import { submitterHashFromRequest } from "@/server/identity";
import { consumeRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const venueId = request.nextUrl.searchParams.get("venueId");
  const dealId = request.nextUrl.searchParams.get("dealId") ?? undefined;
  if (!venueId || !/^[0-9a-f-]{36}$/i.test(venueId)) return jsonError("Unknown venue", 400);

  const viewerHash = submitterHashFromRequest(request);
  const items = await listComments(venueId, { dealId, viewerHash });
  return jsonOk({ comments: items }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const parsed = commentSchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const submitterHash = submitterHashFromRequest(request);
  const limit = await consumeRateLimit(submitterHash, "comment");
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  try {
    const result = await postComment({ ...parsed.data, submitterHash });
    return jsonOk(result, { status: 201 });
  } catch (error) {
    console.error("[api/comments] failed", error);
    return jsonError("Couldn't save that comment", 500);
  }
}
