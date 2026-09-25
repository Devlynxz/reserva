// CSV for spreadsheet exports (RFC 4180), safe against formula injection.
//
// A cell that starts with = + - @ (or tab/CR) is treated as a formula by Excel, Sheets
// and LibreOffice. Customer-entered text ends up in exports (names, notes), so a name like
// `=HYPERLINK("http://evil","click")` must reach the spreadsheet as text: such cells get a
// leading apostrophe. Real numbers are passed as numbers and are never altered.

export type CsvCell = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`Cannot export ${value} to CSV`);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";

  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows → CSV text with CRLF line endings. `bom: true` prepends a UTF-8 byte-order mark
 * so Excel opens non-ASCII text (₱, ñ) correctly.
 */
export function toCsv(rows: readonly (readonly CsvCell[])[], options: { bom?: boolean } = {}): string {
  const body = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  return `${options.bom ? "﻿" : ""}${body}\r\n`;
}
