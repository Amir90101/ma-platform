// CSV для Excel с русской локалью: UTF-8 с BOM (иначе кириллица ломается),
// разделитель «;», дробные числа через запятую, строки через CRLF.

export type CsvCell = string | number | null;

function cell(value: CsvCell): string {
  if (value === null) return "";
  const text =
    typeof value === "number" ? String(value).replace(".", ",") : value;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return (
    "﻿" +
    [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") +
    "\r\n"
  );
}
