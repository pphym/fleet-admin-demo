import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, DEMO_USERS, signToken, verifyToken } from "@/lib/auth";
import { fail } from "@/lib/http";

// Demo button only: swap your access token for one that expired a second ago,
// so the next request shows 401 → refresh → retry in the request log.
export function POST(request: NextRequest) {
  const user = verifyToken(request.cookies.get(AUTH_COOKIE)?.value);
  const account = user && Object.values(DEMO_USERS).find((u) => u.sub === user.sub);
  if (!account) return fail(401, "Unauthorized");

  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_COOKIE, signToken(account, "access", -1), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return res;
}
