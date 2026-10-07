import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dealReports } from "@/db/schema";
import { isAdminRequest } from "@/server/admin";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { applyPriceChange } from "@/server/revisions";

/**
 * Acts on a single price-correction report.
 *
 * "apply" routes through applyPriceChange like every other price edit, so the
 * revision history and the confirmation reset are identical to a community
 * price change - a moderator shortcut must not become a second, quieter path
 * into the deals table.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("Not authorized", 401);

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Unknown report", 404);

  const body = (await readJson(request)) as { decision?: string } | null;
  const decision = body?.decision;
  if (decision !== "apply" && decision !== "dismiss") {
    return jsonError("decision must be 'apply' or 'dismiss'", 400);
  }

  const [report] = await db.select().from(dealReports).where(eq(dealReports.id, id)).limit(1);
  if (!report) return jsonError("Unknown report", 404);
  if (report.status !== "pending") return jsonError("Already handled", 409);

  if (decision === "apply") {
    if (report.dealId === null || report.reportedPriceCents === null) {
      return jsonError("That report carries no price to apply", 400);
    }
    const updated = await applyPriceChange({
      dealId: report.dealId,
      newPriceCents: report.reportedPriceCents,
      actor: "moderator",
      note: "Applied from a community price report",
      sourceType: "moderator",
      // The reporter saw this price; that is a confirmation of the new one.
      verifiedNow: true,
    });
    if (!updated) return jsonError("That deal no longer exists", 404);
  }

  await db
    .update(dealReports)
    .set({
      status: decision === "apply" ? "approved" : "rejected",
      resolvedAt: new Date(),
      resolvedBy: "moderator",
      resolutionNote: decision === "apply" ? "Price updated" : "Dismissed",
    })
    .where(eq(dealReports.id, id));

  return jsonOk({
    ok: true as const,
    message: decision === "apply" ? "Price updated" : "Dismissed",
  });
}
