import { NextResponse } from "next/server";

/** One error shape for every route: { success: false, message }. */
export const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, message }, { status });
