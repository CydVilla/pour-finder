import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/server/http";
import { isAdminRequest } from "@/server/admin";
import { listPendingSubmissions } from "@/server/submissions";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return jsonError("Not authorized", 401);
  return jsonOk({ submissions: await listPendingSubmissions(100) });
}
