import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

export function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
