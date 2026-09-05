import "server-only";
import { cookies } from "next/headers";

/**
 * Deliberately minimal moderation gate: a shared secret in a cookie.
 *
 * The consumer experience is the priority for the MVP, and a single operator
 * does not need SSO. Everything the queue touches goes through the same
 * services the public API uses, so replacing this with real auth later is a
 * change to one function.
 *
 * Leaving ADMIN_TOKEN unset disables the admin surface entirely rather than
 * leaving it open.
 */
export const ADMIN_COOKIE = "pf_admin";

export function adminTokenConfigured(): boolean {
  return Boolean(process.env.ADMIN_TOKEN && process.env.ADMIN_TOKEN.length >= 16);
}

export async function isAdmin(): Promise<boolean> {
  if (!adminTokenConfigured()) return false;
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  return Boolean(token && timingSafeEqual(token, process.env.ADMIN_TOKEN!));
}

export function isAdminRequest(request: Request): boolean {
  if (!adminTokenConfigured()) return false;
  const header = request.headers.get("x-admin-token");
  if (header && timingSafeEqual(header, process.env.ADMIN_TOKEN!)) return true;

  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1);

  return Boolean(cookie && timingSafeEqual(decodeURIComponent(cookie), process.env.ADMIN_TOKEN!));
}

/** Constant-time-ish comparison; avoids leaking length via early exit. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
