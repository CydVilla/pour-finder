import type { NextRequest } from "next/server";
import { parseFilters } from "@/lib/filters";
import { searchDeals } from "@/server/deals-query";
import { jsonError, jsonOk } from "@/server/http";

/**
 * The one read endpoint the whole discovery UI runs on.
 *
 * Never returns the full dataset: every request is bounded by a bbox and/or
 * radius plus a hard 300-venue ceiling, so "50 states, hundreds of thousands
 * of deals" never turns into a browser download.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const filters = parseFilters(request.nextUrl.searchParams);
  const requestId = request.nextUrl.searchParams.get("rid") ?? "";

  try {
    const result = await searchDeals(filters, requestId);
    return jsonOk(result, {
      headers: {
        // Short shared-cache window absorbs bursts (everyone opens the app at
        // 5pm) without ever showing a stale confirmation to the person who
        // just tapped it - their own response is uncached by the browser.
        "Cache-Control": "private, no-store",
        "CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("[api/deals] search failed", error);
    return jsonError("Could not load deals right now", 500);
  }
}
