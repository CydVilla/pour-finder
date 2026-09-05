import type { NextRequest } from "next/server";
import { jsonOk } from "@/server/http";
import { searchVenues, venuesNear } from "@/server/venues";

/**
 * Venue typeahead for the submission flow. With a position, "what's near me"
 * with an empty query - because the bar you're standing in is the one you mean.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const lat = numberOrUndefined(params.get("lat"));
  const lng = numberOrUndefined(params.get("lng"));

  if (q.length < 2) {
    if (lat !== undefined && lng !== undefined) {
      return jsonOk({ venues: await venuesNear(lat, lng) });
    }
    return jsonOk({ venues: [] });
  }

  return jsonOk({ venues: await searchVenues({ q, lat, lng }) });
}

function numberOrUndefined(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
