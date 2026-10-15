import type { DatabaseSync } from "node:sqlite";
import type { Vehicle } from "./db";

/** Opaque to the client: base64url of the (created_at, id) of a boundary row. */
type Cursor = { c: number; i: number };

export class BadCursorError extends Error {}

export const encodeCursor = (v: Pick<Vehicle, "createdAt" | "id">) =>
  Buffer.from(JSON.stringify({ c: v.createdAt, i: v.id })).toString("base64url");

export function decodeCursor(s: string | null | undefined): Cursor | null {
  if (!s) return null;
  try {
    const c = JSON.parse(Buffer.from(s, "base64url").toString());
    if (Number.isInteger(c?.c) && Number.isInteger(c?.i)) return c;
  } catch {}
  throw new BadCursorError("Invalid cursor");
}

export const COLUMNS =
  "id, plate, model, status, odometer_km AS odometerKm, created_at AS createdAt";

/** `plate LIKE %q%`, with LIKE wildcards in the user's text escaped. Shared with export. */
export function plateFilter(q?: string | null) {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (q) {
    where.push("plate LIKE ? ESCAPE '\\'");
    args.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
  }
  return { where, args };
}

export type PageQuery = {
  cursor?: string | null;
  dir?: "next" | "prev";
  limit: number;
  q?: string | null;
};

export type Page = {
  items: Vehicle[];
  nextCursor: string | null;
  prevCursor: string | null;
};

/**
 * Keyset pagination, newest first: ORDER BY created_at DESC, id DESC.
 *
 * - next: rows strictly *after* the cursor  → (created_at, id) < cursor
 * - prev: rows strictly *before* the cursor → (created_at, id) > cursor,
 *         read in ascending order then flipped back
 * - "Last page" is just `dir=prev` with no cursor.
 *
 * Fetches limit + 1 rows: the extra row only says "there is more that way".
 * Cost is the same on page 1 and page 500 — no OFFSET scan.
 */
export function listVehicles(db: DatabaseSync, query: PageQuery): Page {
  const after = decodeCursor(query.cursor);
  const back = query.dir === "prev";
  const { limit } = query;

  const { where, args } = plateFilter(query.q);
  if (after) {
    where.push(back ? "(created_at, id) > (?, ?)" : "(created_at, id) < (?, ?)");
    args.push(after.c, after.i);
  }
  const order = back ? "ASC" : "DESC";

  const rows = db
    .prepare(
      `SELECT ${COLUMNS}
         FROM vehicles
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at ${order}, id ${order}
        LIMIT ?`,
    )
    .all(...args, limit + 1) as Vehicle[];

  const more = rows.length > limit;

  // Walked back past the start: the first page would come out short,
  // so serve the real first page instead.
  if (back && !more) return listVehicles(db, { ...query, cursor: null, dir: "next" });

  const items = rows.slice(0, limit);
  if (back) items.reverse();

  const first = items[0];
  const last = items.at(-1);
  // Going forward, "more" means a next page; having a cursor means we came
  // from somewhere, so there is a previous one. Mirrored when going back.
  const hasNext = back ? after !== null : more;
  const hasPrev = back ? more : after !== null;

  return {
    items,
    nextCursor: last && hasNext ? encodeCursor(last) : null,
    prevCursor: first && hasPrev ? encodeCursor(first) : null,
  };
}
