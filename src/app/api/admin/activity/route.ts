import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/server/admin";
import { activityCounts, recentActivity } from "@/server/activity";
import { jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return jsonError("Not authorized", 401);
  const days = Number(request.nextUrl.searchParams.get("days") ?? 14);
  return jsonOk({
    items: await recentActivity(Number.isFinite(days) ? days : 14),
    counts: await activityCounts(7),
  });
}
