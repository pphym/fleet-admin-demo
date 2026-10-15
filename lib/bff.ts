import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, can, verifyToken, type Action } from "./auth";
import { fail } from "./http";

/**
 * BFF proxy for one backend namespace.
 *
 * Browser ──cookie──▶ BFF ──Bearer──▶ backend
 *
 * 1. reads the JWT from the httpOnly cookie (401 if missing / invalid / expired)
 * 2. checks the action permission for this HTTP method, fail closed (403)
 * 3. forwards path + query + body to the backend with `Authorization: Bearer`
 * 4. passes the backend's status, body and download headers straight through
 *
 * A method missing from `actionByMethod` maps to no action, and `can()` denies it.
 */
export function bffProxy(namespace: string, actionByMethod: Partial<Record<string, Action>>) {
  return async function proxy(
    request: NextRequest,
    ctx?: { params?: Promise<{ path?: string[] }> },
  ) {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    const user = verifyToken(token);
    if (!user) return fail(401, "Unauthorized");

    // A hidden or disabled button is not access control. This check is.
    if (!can(user.role, actionByMethod[request.method])) return fail(403, "Forbidden");

    const { path = [] } = (await ctx?.params) ?? {}; // no params on non-catch-all routes
    const url = `${backendBase(request)}/${[namespace, ...path].map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    try {
      const res = await fetch(url, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(hasBody && { "content-type": request.headers.get("content-type") ?? "application/json" }),
        },
        body: hasBody ? await request.text() : undefined,
        cache: "no-store",
        signal: request.signal, // browser aborts → backend call is aborted too
      });
      const headers = new Headers();
      for (const h of ["content-type", "content-disposition"]) {
        const v = res.headers.get(h);
        if (v) headers.set(h, v);
      }
      return new NextResponse(res.body, { status: res.status, headers });
    } catch (e) {
      if (request.signal.aborted) return fail(499, "Client closed request");
      return fail(502, "Backend unreachable");
    }
  };
}

// ponytail: the backend lives in this same app for the demo. Point BACKEND_URL
// at a real service and nothing else changes.
const backendBase = (request: NextRequest) =>
  process.env.BACKEND_URL ?? `${request.nextUrl.origin}/api/backend`;
