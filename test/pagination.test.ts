import assert from "node:assert/strict";
import { test } from "node:test";
import { createDb } from "../lib/db.ts";
import { BadCursorError, listVehicles, type Page } from "../lib/pagination.ts";

// 250 rows squeezed into 10 distinct timestamps → ~25 ties per timestamp.
// Without the id tie-breaker in the cursor, rows would be skipped or repeated.
const ROWS = 250;
const LIMIT = 20;
const ids = (p: Page) => p.items.map((v) => v.id);

function walkForward(db = createDb(ROWS, 10)) {
  const seen: number[] = [];
  let page = listVehicles(db, { limit: LIMIT });
  for (;;) {
    seen.push(...ids(page));
    if (!page.nextCursor) return seen;
    page = listVehicles(db, { limit: LIMIT, cursor: page.nextCursor });
  }
}

test("walking forward visits every row exactly once, newest first", () => {
  const db = createDb(ROWS, 10);
  const seen = walkForward(db);
  assert.equal(seen.length, ROWS);
  assert.equal(new Set(seen).size, ROWS);

  const all = db
    .prepare("SELECT id FROM vehicles ORDER BY created_at DESC, id DESC")
    .all()
    .map((r) => (r as { id: number }).id);
  assert.deepEqual(seen, all);
});

test("walking backward from the last page visits the same rows", () => {
  const db = createDb(ROWS, 10);
  const pages: number[][] = [];
  let page = listVehicles(db, { limit: LIMIT, dir: "prev" }); // "Last"
  assert.equal(page.nextCursor, null, "last page has no next");
  for (;;) {
    pages.unshift(ids(page));
    if (!page.prevCursor) break;
    page = listVehicles(db, { limit: LIMIT, dir: "prev", cursor: page.prevCursor });
  }
  assert.equal(pages[0].length, LIMIT, "first page is full, not a short leftover");
  assert.equal(new Set(pages.flat()).size, ROWS);
});

test("Prev after Next returns the page you came from", () => {
  const db = createDb(ROWS, 10);
  const p1 = listVehicles(db, { limit: LIMIT });
  const p2 = listVehicles(db, { limit: LIMIT, cursor: p1.nextCursor });
  const back = listVehicles(db, { limit: LIMIT, dir: "prev", cursor: p2.prevCursor });
  assert.deepEqual(ids(back), ids(p1));
  assert.equal(back.prevCursor, null, "page 1 has no prev");
});

test("a new row inserted mid-walk: cursor never repeats a row, OFFSET does", () => {
  const db = createDb(ROWS, 10);
  const p1 = listVehicles(db, { limit: LIMIT });

  // someone adds the newest vehicle while the user is on page 1
  db.prepare(
    "INSERT INTO vehicles (plate, model, status, odometer_km, created_at) VALUES ('NEW-1', 'x', 'online', 0, ?)",
  ).run(Date.UTC(2030, 0, 1));

  const p2 = listVehicles(db, { limit: LIMIT, cursor: p1.nextCursor });
  assert.equal(ids(p2).filter((id) => ids(p1).includes(id)).length, 0);

  const offsetPage2 = db
    .prepare("SELECT id FROM vehicles ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?")
    .all(LIMIT, LIMIT)
    .map((r) => (r as { id: number }).id);
  assert.ok(
    offsetPage2.includes(ids(p1).at(-1)!),
    "OFFSET shows the last row of page 1 again",
  );
});

test("search filter works with the cursor", () => {
  const db = createDb(ROWS, 10);
  const page = listVehicles(db, { limit: 5, q: "DEMO-001" }); // DEMO-00100 … 00199
  assert.ok(page.items.every((v) => v.plate.includes("DEMO-001")));
  const rest = listVehicles(db, { limit: 500, q: "DEMO-001", cursor: page.nextCursor });
  assert.equal(page.items.length + rest.items.length, 100);
});

test("LIKE wildcards in the search are treated as text", () => {
  assert.equal(listVehicles(createDb(ROWS, 10), { limit: 5, q: "%" }).items.length, 0);
});

test("a tampered cursor is rejected, not silently treated as page 1", () => {
  const db = createDb(ROWS, 10);
  assert.throws(() => listVehicles(db, { limit: 5, cursor: "garbage" }), BadCursorError);
});

test("the keyset query uses the index instead of sorting the table", () => {
  const db = createDb(ROWS, 10);
  const plan = db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT id FROM vehicles WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT 21",
    )
    .all(0, 0)
    .map((r) => (r as { detail: string }).detail)
    .join(" | ");
  assert.match(plan, /vehicles_keyset/);
  assert.doesNotMatch(plan, /TEMP B-TREE/);
});
