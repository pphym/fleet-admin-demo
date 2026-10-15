import { NextRequest } from "next/server";
import { authorize } from "@/lib/backendAuth";
import { getDb, type Vehicle } from "@/lib/db";
import { vehiclesWorkbook } from "@/lib/excel";
import { fail } from "@/lib/http";
import { COLUMNS, plateFilter } from "@/lib/pagination";

// ponytail: builds the whole file in memory. Fine for tens of thousands of
// rows; stream rows into the response if exports ever reach millions.
const MAX_ROWS = 20_000;

// GET /api/backend/vehicles/export?q=: every vehicle matching the search, as .xlsx
export function GET(request: NextRequest) {
  const { error } = authorize(request, "VIEW");
  if (error) return error;

  const { where, args } = plateFilter(request.nextUrl.searchParams.get("q")?.trim().slice(0, 50));
  const rows = getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM vehicles
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .all(...args, MAX_ROWS + 1) as Vehicle[];
  if (rows.length > MAX_ROWS) return fail(400, `More than ${MAX_ROWS} rows. Narrow the search first.`);

  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(vehiclesWorkbook(rows)), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="vehicles-${date}.xlsx"`,
    },
  });
}
