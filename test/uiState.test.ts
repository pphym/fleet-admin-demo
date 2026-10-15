import assert from "node:assert/strict";
import { test } from "node:test";
import { createDb } from "../lib/db.ts";
import { applyChanges, clearState, parseChanges, readState } from "../lib/uiState.ts";

test("parseChanges accepts a normal bulk update", () => {
  assert.deepEqual(parseChanges({ changes: { "vehicles.limit": 50, "vehicles.cursor": null } }), {
    "vehicles.limit": 50,
    "vehicles.cursor": null,
  });
});

test("parseChanges rejects bad input with a message", () => {
  for (const bad of [
    null,
    {},
    { changes: [] },
    { changes: {} },
    { changes: { "bad key!": 1 } },
    { changes: { k: "x".repeat(3000) } },
    { changes: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i])) },
  ]) {
    assert.equal(typeof parseChanges(bad), "string", JSON.stringify(bad)?.slice(0, 60));
  }
});

test("state is per user; null forgets a key; clear only touches one user", () => {
  const db = createDb(0);
  applyChanges(db, "alice", { "vehicles.limit": 50, "vehicles.q": "DEMO" });
  applyChanges(db, "bob", { "vehicles.limit": 10 });
  applyChanges(db, "alice", { "vehicles.q": null, "vehicles.dir": "prev" });

  assert.deepEqual(readState(db, "alice"), { "vehicles.limit": 50, "vehicles.dir": "prev" });
  clearState(db, "alice");
  assert.deepEqual(readState(db, "alice"), {});
  assert.deepEqual(readState(db, "bob"), { "vehicles.limit": 10 });
});
