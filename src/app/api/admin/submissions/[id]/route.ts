import type { NextRequest } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/server/admin";
import { jsonError, jsonOk, readJson, zodError } from "@/server/http";
import { applySubmission, rejectSubmission } from "@/server/submissions";

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "duplicate"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("Not authorized", 401);

  const { id } = await context.params;
  const parsed = actionSchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  if (parsed.data.action === "approve") {
    const result = await applySubmission(id, "moderator");
    return result.ok ? jsonOk(result) : jsonError(result.message, 409);
  }

  const result = await rejectSubmission(
    id,
    "moderator",
    parsed.data.note ?? "",
    parsed.data.action === "duplicate" ? "duplicate" : "rejected",
  );
  return result.ok ? jsonOk(result) : jsonError("Submission not found", 404);
}
