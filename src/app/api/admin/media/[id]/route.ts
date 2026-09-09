import type { NextRequest } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/server/admin";
import { jsonError, jsonOk, readJson, zodError } from "@/server/http";
import { reviewMedia } from "@/server/media";

const schema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("Not authorized", 401);

  const { id } = await context.params;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const ok = await reviewMedia(id, parsed.data.decision, "moderator", parsed.data.note);
  return ok ? jsonOk({ ok: true }) : jsonError("Unknown upload", 404);
}
