import { NextRequest, NextResponse } from "next/server";
import { requireBearer } from "@/lib/backendAuth";
import { getDb } from "@/lib/db";
import { fail } from "@/lib/http";

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireBearer(request, "DELETE");
  if (denied) return denied;

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1) return fail(400, "Invalid id");

  const { changes } = getDb().prepare("DELETE FROM vehicles WHERE id = ?").run(id);
  if (!changes) return fail(404, "Vehicle not found");
  return NextResponse.json({ success: true });
}
