import { NextRequest } from "next/server";
import { deleteVehicleHandler } from "@/lib/backend/deleteVehicle";
import { exportVehiclesHandler } from "@/lib/backend/export";
import { deleteUiState, getUiState, patchUiState } from "@/lib/backend/uiState";
import { listVehiclesHandler } from "@/lib/backend/vehicles";
import { fail } from "@/lib/http";

/**
 * The whole "backend" is one route on purpose. On serverless hosts (Vercel)
 * every route is its own function with its own memory, and the demo DB lives
 * in memory. One route = one function = one DB, so a delete shows up in the
 * list right away.
 *
 *   GET    vehicles            list (cursor pagination)
 *   GET    vehicles/export     .xlsx of every match
 *   DELETE vehicles/:id
 *   GET | PATCH | DELETE  ui-state
 */
async function route(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const [ns, sub, ...rest] = (await ctx.params).path;
  const m = request.method;
  if (rest.length === 0) {
    if (ns === "vehicles") {
      if (!sub && m === "GET") return listVehiclesHandler(request);
      if (sub === "export" && m === "GET") return exportVehiclesHandler(request);
      if (sub && m === "DELETE") return deleteVehicleHandler(request, sub);
    }
    if (ns === "ui-state" && !sub) {
      if (m === "GET") return getUiState(request);
      if (m === "PATCH") return patchUiState(request);
      if (m === "DELETE") return deleteUiState(request);
    }
  }
  return fail(404, "Not found");
}

export { route as GET, route as PATCH, route as DELETE };
