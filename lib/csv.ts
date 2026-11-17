// Spreadsheet apps run text cells that start with these characters as formulas.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

export type CsvValue = string | number | null | undefined;

// Plain numbers (including negative amounts) stay numeric; other text that could be read
// as a formula gets a leading apostrophe. Cells with commas, quotes or line breaks are quoted.
export function csvCell(value: CsvValue) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value !== "number" && !PLAIN_NUMBER.test(text) && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvValue[][]) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
