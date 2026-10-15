import { NextRequest, NextResponse } from "next/server";
import { DEMO_USERS } from "@/lib/auth";
import { fail } from "@/lib/http";
import { setSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const { user } = await request.json().catch(() => ({}));
  if (typeof user !== "string" || !Object.hasOwn(DEMO_USERS, user)) {
    return fail(400, "Unknown demo user");
  }
  return setSession(NextResponse.json({ success: true }), DEMO_USERS[user as keyof typeof DEMO_USERS]);
}
