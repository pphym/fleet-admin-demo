import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, DEMO_USERS, signToken } from "@/lib/auth";
import { fail } from "@/lib/http";

export async function POST(request: NextRequest) {
  const { user } = await request.json().catch(() => ({}));
  if (!Object.hasOwn(DEMO_USERS, user)) return fail(400, "Unknown demo user");

  const res = NextResponse.json({ success: true });
  // The token lives only in an httpOnly cookie — page JS can never read it.
  res.cookies.set(AUTH_COOKIE, signToken(DEMO_USERS[user as keyof typeof DEMO_USERS]), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  return res;
}
