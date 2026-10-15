import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/backendAuth";
import { getDb } from "@/lib/db";
import { fail } from "@/lib/http";
import { BadCursorError, listVehicles } from "@/lib/pagination";

// GET /api/backend/vehicles?cursor=&dir=next|prev&limit=20&q=&slow=1
export async function listVehiclesHandler(request: NextRequest) {
  const { error } = authorize(request, "VIEW");
  if (error) return error;

  const p = request.nextUrl.searchParams;
  const limit = Number(p.get("limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return fail(400, "limit must be an integer between 1 and 100");
  }

  // Demo knob: pretend this is a heavy report query. Aborting the browser
  // request aborts the BFF's fetch, which aborts this wait. No work is wasted.
  if (p.get("slow") === "1" && !(await wait(3000, request.signal))) {
    console.info("[backend] slow query cancelled by the client");
    return fail(499, "Client closed request");
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

/** Resolves true after `ms`, or false as soon as `signal` aborts. */
function wait(ms: number, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal.aborted) return resolve(false);
    const t = setTimeout(() => resolve(true), ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve(false)), { once: true });
  });
}
