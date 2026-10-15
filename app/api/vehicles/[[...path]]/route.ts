import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, can, verifyToken, type Action } from "@/lib/auth";
import { fail } from "@/lib/http";

/**
 * BFF proxy for the whole /vehicles namespace.
 *
 * Browser ──cookie──▶ this route ──Bearer──▶ backend
 *
 * 1. reads the JWT from the httpOnly cookie (401 if missing / invalid)
 * 2. checks the action permission for this HTTP method, fail closed (403)
 * 3. forwards path + query to the backend with `Authorization: Bearer`
 * 4. passes the backend's status and body straight through
 */

// A method not listed here maps to no action, and `can()` denies it.
const ACTION_BY_METHOD: Partial<Record<string, Action>> = {
  GET: "VIEW",
  DELETE: "DELETE",
};

// ponytail: backend lives in this same app for the demo; point BACKEND_URL
// at a real service and nothing else changes.
const backendBase = (request: NextRequest) =>
  process.env.BACKEND_URL ?? `${request.nextUrl.origin}/api/backend`;

async function proxy(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const user = verifyToken(token);
  if (!user) return fail(401, "Unauthorized");

  // A hidden or disabled button is not access control — this is.
  if (!can(user.role, ACTION_BY_METHOD[request.method])) return fail(403, "Forbidden");

  const { path = [] } = await ctx.params;
  const url = `${backendBase(request)}/${["vehicles", ...path].map(encodeURIComponent).join("/")}${request.nextUrl.search}`;

  try {
    const res = await fetch(url, {
      method: request.method,
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return new NextResponse(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return fail(502, "Backend unreachable");
  }
}

export { proxy as GET, proxy as DELETE };
