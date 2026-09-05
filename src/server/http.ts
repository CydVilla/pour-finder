import "server-only";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type { ApiError } from "@/lib/types";

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function jsonError(
  error: string,
  status: number,
  extra: Omit<ApiError, "error"> = {},
): NextResponse<ApiError> {
  return NextResponse.json({ error, ...extra }, { status });
}

export function zodError(error: ZodError): NextResponse<ApiError> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return jsonError("Some fields need attention", 422, { fieldErrors });
}

export function rateLimited(retryAfterSeconds: number): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error: "You're going a bit fast. Try again shortly.",
      detail: `Retry in about ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/** Parses a JSON body, returning null rather than throwing on malformed input. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
