import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export function POST() {
  return clearSession(NextResponse.json({ success: true }));
}
