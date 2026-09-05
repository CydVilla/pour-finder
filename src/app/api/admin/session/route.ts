import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, adminTokenConfigured } from "@/server/admin";
import { jsonError, readJson, zodError } from "@/server/http";

const schema = z.object({ token: z.string().min(1).max(200) });

/** Exchanges the shared secret for an httpOnly cookie. */
export async function POST(request: Request) {
  if (!adminTokenConfigured()) return jsonError("Admin is disabled", 404);

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);
  if (parsed.data.token !== process.env.ADMIN_TOKEN) return jsonError("Nope", 401);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, parsed.data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
