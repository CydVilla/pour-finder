import type { NextRequest } from "next/server";
import { envString } from "@/lib/env";
import { jsonError, jsonOk } from "@/server/http";
import { isAdminRequest } from "@/server/admin";
import { runSweep } from "@/server/sweep";

/**
 * Scheduled housekeeping. Deletes storage objects, so it is gated.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. An admin token is
 * also accepted so the sweep can be run by hand while debugging.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = envString("CRON_SECRET");
  const authorized =
    (secret && request.headers.get("authorization") === `Bearer ${secret}`) ||
    isAdminRequest(request);

  if (!authorized) return jsonError("Not authorized", 401);

  try {
    return jsonOk({ ok: true as const, ...(await runSweep()) });
  } catch (error) {
    console.error("[cron/sweep] failed", error);
    return jsonError("Sweep failed", 500);
  }
}
