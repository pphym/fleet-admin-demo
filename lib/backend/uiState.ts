import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/backendAuth";
import { getDb } from "@/lib/db";
import { fail } from "@/lib/http";
import { applyChanges, clearState, parseChanges, readState } from "@/lib/uiState";

// Every query is scoped to the token's user: there is no way to name
// another user's state in the request.

export function getUiState(request: NextRequest) {
  const { user, error } = authorize(request, "VIEW");
  if (error) return error;
  return NextResponse.json({ success: true, state: readState(getDb(), user.sub) });
}

export async function patchUiState(request: NextRequest) {
  const { user, error } = authorize(request, "VIEW");
  if (error) return error;

  const changes = parseChanges(await request.json().catch(() => null));
  if (typeof changes === "string") return fail(400, changes);

  applyChanges(getDb(), user.sub, changes);
  return NextResponse.json({ success: true });
}

export function deleteUiState(request: NextRequest) {
  const { user, error } = authorize(request, "VIEW");
  if (error) return error;
  clearState(getDb(), user.sub);
  return NextResponse.json({ success: true });
}
