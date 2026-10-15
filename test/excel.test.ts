import assert from "node:assert/strict";
import { test } from "node:test";
import XLSX from "xlsx-js-style";
import { vehiclesWorkbook } from "../lib/excel.ts";

const rows = [
  { id: 1, plate: "DEMO-00001", model: "Toyota Commuter", status: "online", odometerKm: 123_456, createdAt: Date.UTC(2025, 0, 2, 3, 4) },
  { id: 2, plate: "DEMO-00002", model: "Hino 300", status: "parked", odometerKm: 1_000, createdAt: Date.UTC(2025, 5, 1) },
];

const read = (buf: Buffer) => XLSX.read(buf, { cellStyles: true }).Sheets.Vehicles;

test("header, data, and a total row with a live SUM formula", () => {
  const ws = read(vehiclesWorkbook(rows));
  assert.equal(ws.A1.v, "ID");
  assert.equal(ws.B2.v, "DEMO-00001");
  assert.equal(ws.A4.v, "Total");
  assert.equal(ws.B4.v, "2 vehicles");
  assert.equal(ws.E4.f, "SUM(E2:E3)");
  assert.equal(ws.E4.v, 124_456);
});

test("dates are written as UTC Excel dates, independent of the server's time zone", () => {
  const ws = read(vehiclesWorkbook(rows));
  // 2025-01-02 03:04 UTC → serial 45659.127777…
  assert.ok(Math.abs(ws.F2.v - (45_659 + (3 * 60 + 4) / 1440)) < 1e-9);
});

test("columns are sized to their longest displayed value", () => {
  const cols = read(vehiclesWorkbook(rows))["!cols"]!;
  assert.equal(cols[2].wch, "Toyota Commuter".length + 2); // longest model
  assert.equal(cols[4].wch, "Odometer (km)".length + 2); // header wins over "124,456"
  assert.equal(cols[5].wch, "2025-01-02 03:04".length + 2);
});

test("an empty export still has a header and a total row", () => {
  const ws = read(vehiclesWorkbook([]));
  assert.equal(ws.A1.v, "ID");
  assert.equal(ws.B2.v, "0 vehicles");
});
