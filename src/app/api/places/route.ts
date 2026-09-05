import type { NextRequest } from "next/server";
import { geocode } from "@/lib/geocode";
import { jsonOk } from "@/server/http";

/**
 * City / ZIP / neighborhood lookup for the "GPS is off" path. Served by the
 * offline gazetteer, so this costs nothing and works without network egress.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return jsonOk({ places: [] });

  const places = await geocode(q, 6);
  return jsonOk(
    { places },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
