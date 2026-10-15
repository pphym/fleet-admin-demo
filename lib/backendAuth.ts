import type { NextRequest } from "next/server";
import { can, verifyToken, type Action } from "./auth";
import { fail } from "./http";

/**
 * Backend side: accepts only `Authorization: Bearer`, never the cookie.
 * Re-checks the permission too (defence in depth) — anyone can call the
 * backend directly and skip the BFF.
 * Returns an error response, or null when the caller may proceed.
 */
export function requireBearer(request: NextRequest, action: Action) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const user = verifyToken(token);
  if (!user) return fail(401, "Unauthorized");
  if (!can(user.role, action)) return fail(403, "Forbidden");
  return null;
}
