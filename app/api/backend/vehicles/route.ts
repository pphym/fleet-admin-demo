import { NextRequest, NextResponse } from "next/server";
import { requireBearer } from "@/lib/backendAuth";
import { getDb } from "@/lib/db";
import { fail } from "@/lib/http";
import { BadCursorError, listVehicles } from "@/lib/pagination";

// GET /api/backend/vehicles?cursor=&dir=next|prev&limit=20&q=
export function GET(request: NextRequest) {
  const denied = requireBearer(request, "VIEW");
  if (denied) return denied;

  const p = request.nextUrl.searchParams;
  const limit = Number(p.get("limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return fail(400, "limit must be an integer between 1 and 100");
  }

  try {
    const page = listVehicles(getDb(), {
      cursor: p.get("cursor"),
      dir: p.get("dir") === "prev" ? "prev" : "next",
      limit,
      q: p.get("q")?.trim().slice(0, 50),
    });
    return NextResponse.json({ success: true, ...page });
  } catch (e) {
    if (e instanceof BadCursorError) return fail(400, e.message);
    throw e;
  }
}
