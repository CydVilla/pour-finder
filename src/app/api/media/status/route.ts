import { jsonOk } from "@/server/http";
import { MEDIA_LIMITS } from "@/lib/media-limits";
import { isStorageConfigured } from "@/server/storage";

/** Lets the UI hide upload controls when object storage isn't set up. */
export async function GET() {
  return jsonOk(
    { configured: isStorageConfigured(), limits: MEDIA_LIMITS },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
