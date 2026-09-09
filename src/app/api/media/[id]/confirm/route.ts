import type { NextRequest } from "next/server";
import { confirmUpload } from "@/server/media";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { submitterHashFromRequest } from "@/server/identity";

/** Marks the upload complete. Unconfirmed rows are abandoned uploads. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Unknown upload", 404);

  const body = (await readJson(request)) as { url?: unknown } | null;
  const reportedUrl = typeof body?.url === "string" ? body.url : null;

  const result = await confirmUpload(id, submitterHashFromRequest(request), reportedUrl);
  if (!result.ok) {
    return result.reason === "untrusted_url"
      ? jsonError("That upload URL doesn't match what we issued.", 400)
      : jsonError("Unknown upload", 404);
  }

  return jsonOk({
    ok: true as const,
    status: result.status,
    message:
      result.status === "visible"
        ? "Thanks — it's live."
        : "Thanks — a moderator will check it before it appears.",
  });
}
