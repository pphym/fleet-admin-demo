import type { NextRequest } from "next/server";
import { can, verifyToken, type Action, type User } from "./auth";
import { fail } from "./http";

/**
 * Backend side: accepts only `Authorization: Bearer`, never the cookie.
 * Re-checks the permission too (defence in depth): anyone can call the
 * backend directly and skip the BFF.
 */
export function authorize(
  request: NextRequest,
  action: Action,
): { user: User; error?: never } | { user?: never; error: Response } {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const user = verifyToken(token);
  if (!user) return { error: fail(401, "Unauthorized") };
  if (!can(user.role, action)) return { error: fail(403, "Forbidden") };
  return { user };
}
