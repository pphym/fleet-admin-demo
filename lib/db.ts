import { DatabaseSync } from "node:sqlite";

export type Vehicle = {
  id: number;
  plate: string;
  model: string;
  status: string;
  odometerKm: number;
  createdAt: number;
};

const MODELS = ["Isuzu D-Max", "Toyota Hilux", "Hino 300", "Fuso Canter", "Toyota Commuter"];
const STATUSES = ["online", "offline", "parked"];

/**
 * In-memory SQLite with fake vehicles. `spanHours` controls how many distinct
 * timestamps exist — a small span forces lots of ties on created_at, which is
 * exactly the case a keyset cursor must survive (hence the id tie-breaker).
 */
export function createDb(rows: number, spanHours = 24 * 365): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE vehicles (
      id          INTEGER PRIMARY KEY,
      plate       TEXT    NOT NULL,
      model       TEXT    NOT NULL,
      status      TEXT    NOT NULL,
      odometer_km INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX vehicles_keyset ON vehicles (created_at DESC, id DESC);

    -- per-user view settings: one row per (user, key), value is JSON
    CREATE TABLE ui_state (
      user_sub TEXT NOT NULL,
      key      TEXT NOT NULL,
      value    TEXT NOT NULL,
      PRIMARY KEY (user_sub, key)
    );
  `);

  // deterministic PRNG (mulberry32) so every boot / test run sees the same data
  let seed = 42;
  const rand = () => {
    let t = (seed = (seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const start = Date.UTC(2025, 0, 1);
  const insert = db.prepare(
    "INSERT INTO vehicles (plate, model, status, odometer_km, created_at) VALUES (?, ?, ?, ?, ?)",
  );

  db.exec("BEGIN");
  for (let i = 1; i <= rows; i++) {
    insert.run(
      `DEMO-${String(i).padStart(5, "0")}`,
      MODELS[Math.floor(rand() * MODELS.length)],
      STATUSES[Math.floor(rand() * STATUSES.length)],
      Math.floor(rand() * 300_000),
      start + Math.floor(rand() * spanHours) * 3_600_000,
    );
  }
  db.exec("COMMIT");
  return db;
}

// ponytail: in-memory, re-seeded on every cold start — demo data only.
// Swap for a real DB (Turso / Postgres) if deletes must survive a restart.
const g = globalThis as unknown as { db?: DatabaseSync };
export const getDb = () => (g.db ??= createDb(10_000));
