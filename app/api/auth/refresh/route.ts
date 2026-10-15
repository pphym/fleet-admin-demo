import { NextRequest, NextResponse } from "next/server";
import { DEMO_USERS, REFRESH_COOKIE, verifyToken } from "@/lib/auth";
import { fail } from "@/lib/http";
import { clearSession, setSession } from "@/lib/session";

// POST /api/auth/refresh: trade a valid refresh cookie for a new access token.
export function POST(request: NextRequest) {
  const token = verifyToken(request.cookies.get(REFRESH_COOKIE)?.value, "refresh");
  // Look the account up again instead of trusting the old token: a role
  // change (or a deleted user) takes effect on the next refresh.
  const account = token && Object.values(DEMO_USERS).find((u) => u.sub === token.sub);
  if (!account) return clearSession(fail(401, "Session expired"));
  return setSession(NextResponse.json({ success: true }), account, false);
}
