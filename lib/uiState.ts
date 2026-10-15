import type { DatabaseSync } from "node:sqlite";

export const MAX_KEYS = 20;
export const MAX_VALUE_BYTES = 2048;
const KEY = /^[a-zA-Z0-9_.-]{1,64}$/;

/**
 * Validate a PATCH body: `{ changes: { [key]: JSON value | null } }`.
 * `null` means "forget this key" (back to the default).
 * Returns the changes, or an error message for a 400.
 */
export function parseChanges(body: unknown): Record<string, unknown> | string {
  const changes = (body as { changes?: unknown } | null)?.changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return "Body must be { changes: { key: value } }";
  }
  const entries = Object.entries(changes);
  if (entries.length === 0) return "No changes";
  if (entries.length > MAX_KEYS) return `At most ${MAX_KEYS} keys per request`;
  for (const [key, value] of entries) {
    if (!KEY.test(key)) return `Invalid key: ${key.slice(0, 64)}`;
    if (value === undefined) return `Missing value for ${key}`;
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_VALUE_BYTES) return `Value too large for ${key}`;
  }
  return changes as Record<string, unknown>;
}

export function readState(db: DatabaseSync, userSub: string) {
  const rows = db.prepare("SELECT key, value FROM ui_state WHERE user_sub = ?").all(userSub) as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
}

/** Apply all changes in one transaction: every key lands, or none does. */
export function applyChanges(db: DatabaseSync, userSub: string, changes: Record<string, unknown>) {
  const upsert = db.prepare(
    `INSERT INTO ui_state (user_sub, key, value) VALUES (?, ?, ?)
     ON CONFLICT (user_sub, key) DO UPDATE SET value = excluded.value`,
  );
  const remove = db.prepare("DELETE FROM ui_state WHERE user_sub = ? AND key = ?");
  db.exec("BEGIN");
  try {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) remove.run(userSub, key);
      else upsert.run(userSub, key, JSON.stringify(value));
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function clearState(db: DatabaseSync, userSub: string) {
  db.prepare("DELETE FROM ui_state WHERE user_sub = ?").run(userSub);
}
