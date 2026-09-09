import type { NextRequest } from "next/server";
import { listVenueMedia } from "@/server/media";
import { jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const venueId = request.nextUrl.searchParams.get("venueId");
  if (!venueId || !/^[0-9a-f-]{36}$/i.test(venueId)) return jsonError("Unknown venue", 400);

  const kindParam = request.nextUrl.searchParams.get("kind");
  const kind = kindParam === "photo" || kindParam === "video" ? kindParam : undefined;

  return jsonOk(
    { media: await listVenueMedia(venueId, { kind }) },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
