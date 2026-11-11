/**
 * CSV helpers. Cells starting with = + - @ (or tab/CR) are prefixed with an
 * apostrophe to neutralise spreadsheet formula injection. Output has a UTF-8
 * BOM so Excel shows Arabic correctly.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
