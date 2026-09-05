import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/server/http";
import { dealPriceHistory } from "@/server/revisions";

/** Price timeline for a deal. $1 -> $2 -> $1 is fully recoverable. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return jsonError("Unknown deal", 404);

  const history = await dealPriceHistory(dealId);
  return jsonOk({ dealId, history });
}
