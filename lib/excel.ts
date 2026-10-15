import XLSX from "xlsx-js-style";
import type { Vehicle } from "./db";

const FONT = { name: "Calibri", sz: 11 };
const KM = "#,##0";
const DATE = "yyyy-mm-dd hh:mm";

type Column = {
  header: string;
  value: (v: Vehicle) => string | number;
  format?: string;
  /** how the cell will look in Excel, for sizing the column */
  display?: (v: Vehicle) => string;
};

// Excel stores dates as days since 1899-12-30. Converting the UTC timestamp
// ourselves keeps the file independent of the server's time zone.
const excelDate = (ms: number) => ms / 86_400_000 + 25_569;
const isoMinute = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

const COLUMNS: Column[] = [
  { header: "ID", value: (v) => v.id },
  { header: "Plate", value: (v) => v.plate },
  { header: "Model", value: (v) => v.model },
  { header: "Status", value: (v) => v.status },
  {
    header: "Odometer (km)",
    value: (v) => v.odometerKm,
    format: KM,
    display: (v) => v.odometerKm.toLocaleString("en-US"),
  },
  { header: "Created (UTC)", value: (v) => excelDate(v.createdAt), format: DATE, display: (v) => isoMinute(v.createdAt) },
];

/**
 * Styled .xlsx: bold header, Calibri everywhere, number and date formats,
 * columns sized to their longest value, and a total row whose sum is a live
 * formula (with a cached value, so viewers that don't recalculate still show it).
 */
export function vehiclesWorkbook(rows: Vehicle[]): Buffer {
  const border = { top: { style: "thin", color: { rgb: "999999" } } };
  const header = COLUMNS.map((c) => ({
    v: c.header,
    t: "s",
    s: { font: { ...FONT, bold: true }, fill: { fgColor: { rgb: "E8EEF9" } } },
  }));
  const body = rows.map((v) =>
    COLUMNS.map((c) => {
      const value = c.value(v);
      return { v: value, t: typeof value === "number" ? "n" : "s", z: c.format, s: { font: FONT, numFmt: c.format } };
    }),
  );

  const kmCol = COLUMNS.findIndex((c) => c.format === KM);
  const kmLetter = XLSX.utils.encode_col(kmCol);
  const totalKm = rows.reduce((sum, v) => sum + v.odometerKm, 0);
  const total = COLUMNS.map((_, i) => {
    const s = { font: { ...FONT, bold: true }, border, numFmt: i === kmCol ? KM : undefined };
    if (i === 0) return { v: "Total", t: "s", s };
    if (i === 1) return { v: `${rows.length.toLocaleString("en-US")} vehicles`, t: "s", s };
    if (i === kmCol) {
      return { v: totalKm, t: "n", f: rows.length ? `SUM(${kmLetter}2:${kmLetter}${rows.length + 1})` : undefined, z: KM, s };
    }
    return { v: "", t: "s", s };
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...body, total]);

  // Auto-fit: the widest of header, values (as Excel will show them) and total.
  ws["!cols"] = COLUMNS.map((c, i) => {
    const longest = Math.max(
      c.header.length,
      String(total[i].v === totalKm ? totalKm.toLocaleString("en-US") : total[i].v).length,
      ...rows.map((v) => (c.display ? c.display(v) : String(c.value(v))).length),
    );
    return { wch: Math.min(longest + 2, 50) };
  });
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: COLUMNS.length - 1 } }) };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Vehicles");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true });
}
