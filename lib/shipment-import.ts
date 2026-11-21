import { createShipmentSchema, type CreateShipmentInput } from "@/validators/shipment";

// Shared by the import service, the API docs and the template download. Nothing here
// touches the database, so it runs in the browser and in unit tests alike.

export const IMPORT_COLUMNS = [
  "pickupContactName",
  "pickupContactPhone",
  "pickupAddress",
  "deliveryContactName",
  "deliveryContactPhone",
  "deliveryAddress",
  "parcelWeightKg",
  "packageDescription",
  "parcelLengthCm",
  "parcelWidthCm",
  "parcelHeightCm",
  "pickupScheduledAt",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const REQUIRED_IMPORT_COLUMNS: readonly ImportColumn[] = [
  "pickupContactName",
  "pickupContactPhone",
  "pickupAddress",
  "deliveryContactName",
  "deliveryContactPhone",
  "deliveryAddress",
  "parcelWeightKg",
];

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
export const IMPORT_HOURLY_LIMIT = 5;
const MAX_CELL_LENGTH = 2000;
const MAX_COLUMNS = 40;

export type CsvFileErrorCode =
  | "empty_file"
  | "unterminated_quote"
  | "missing_columns"
  | "duplicate_column"
  | "too_many_rows"
  | "too_many_columns"
  | "cell_too_long"
  | "not_csv";

const FILE_MESSAGES: Record<CsvFileErrorCode, string> = {
  empty_file: "The file has no rows. Add a header row and at least one shipment.",
  unterminated_quote: "A quoted value is never closed (row {row}). Check the quotation marks.",
  missing_columns: "These required columns are missing: {columns}.",
  duplicate_column: "The column {column} appears more than once.",
  too_many_rows: "The file has {rows} shipments; the limit is {max}.",
  too_many_columns: "The file has too many columns.",
  cell_too_long: "A value in row {row} is longer than {max} characters.",
  not_csv: "This does not look like a CSV text file.",
};

export class CsvFileError extends Error {
  constructor(public readonly code: CsvFileErrorCode, public readonly params: Record<string, string | number> = {}) {
    super(fill(FILE_MESSAGES[code], params));
    this.name = "CsvFileError";
  }
}

function fill(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}

export interface CsvRecord {
  // Spreadsheet row number: the header is row 1, the first shipment row 2.
  number: number;
  cells: string[];
}

// RFC 4180: quoted values may hold commas, quotes ("") and line breaks. A leading byte
// order mark is dropped; CRLF, LF and a lone CR all end a row; quotes inside an unquoted
// value are kept as they are, the way spreadsheet apps write them.
export function parseCsv(input: string): CsvRecord[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text.includes("\u0000")) throw new CsvFileError("not_csv");
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let quoted = false;
  let number = 1;

  const endCell = () => {
    if (cell.length > MAX_CELL_LENGTH) throw new CsvFileError("cell_too_long", { row: number, max: MAX_CELL_LENGTH });
    cells.push(cell);
    if (cells.length > MAX_COLUMNS) throw new CsvFileError("too_many_columns");
    cell = "";
    quoted = false;
  };
  const endRecord = () => {
    endCell();
    records.push({ number, cells });
    cells = [];
    number += 1;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === "" && !quoted) {
      inQuotes = true;
      quoted = true;
    } else if (char === ",") {
      endCell();
    } else if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRecord();
    } else if (char === "\n") {
      endRecord();
    } else {
      cell += char;
    }
  }
  if (inQuotes) throw new CsvFileError("unterminated_quote", { row: number });
  if (cell !== "" || cells.length > 0 || quoted) endRecord();
  return records;
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const COLUMN_BY_KEY = new Map<string, ImportColumn>(IMPORT_COLUMNS.map((column) => [normalizeHeader(column), column]));

// Cells our own error report writes get a leading apostrophe when they start with a
// formula character (so spreadsheets do not run them); undo that when a fixed file comes back.
const unescapeFormula = (value: string) => value.replace(/^'([=+\-@\t\r])/, "$1");

export interface RawRow {
  number: number;
  values: Partial<Record<ImportColumn, string>>;
  extraCells: boolean;
}

export interface ParsedFile {
  rows: RawRow[];
  unknownColumns: string[];
}

// Turns the records into rows keyed by canonical column name. Headers match without
// regard to case, spaces or underscores ("Pickup contact name" = pickupContactName).
// Fully blank rows are skipped but still count toward row numbers.
export function readRows(records: CsvRecord[]): ParsedFile {
  const [header, ...body] = records;
  if (!header || header.cells.every((cell) => cell.trim() === "")) throw new CsvFileError("empty_file");
  const columns: (ImportColumn | null)[] = [];
  const unknownColumns: string[] = [];
  const seen = new Set<ImportColumn>();
  for (const raw of header.cells) {
    const column = COLUMN_BY_KEY.get(normalizeHeader(raw)) ?? null;
    if (column && seen.has(column)) throw new CsvFileError("duplicate_column", { column });
    if (column) seen.add(column);
    else if (raw.trim() !== "") unknownColumns.push(raw.trim());
    columns.push(column);
  }
  const missing = REQUIRED_IMPORT_COLUMNS.filter((column) => !seen.has(column));
  if (missing.length) throw new CsvFileError("missing_columns", { columns: missing.join(", ") });

  const rows: RawRow[] = [];
  for (const record of body) {
    if (record.cells.every((cell) => cell.trim() === "")) continue;
    const values: Partial<Record<ImportColumn, string>> = {};
    let extraCells = false;
    record.cells.forEach((cell, index) => {
      const column = columns[index];
      const value = unescapeFormula(cell.trim());
      if (column === undefined) {
        if (value !== "") extraCells = true;
      } else if (column) {
        values[column] = value;
      }
    });
    rows.push({ number: record.number, values, extraCells });
  }
  if (rows.length > IMPORT_MAX_ROWS) throw new CsvFileError("too_many_rows", { rows: rows.length, max: IMPORT_MAX_ROWS });
  if (rows.length === 0) throw new CsvFileError("empty_file");
  return { rows, unknownColumns };
}

export type RowIssueCode =
  | "required"
  | "too_short"
  | "too_long"
  | "not_a_number"
  | "must_be_positive"
  | "too_large"
  | "too_many_decimals"
  | "invalid_datetime"
  | "must_be_future"
  | "dimensions_all_or_none"
  | "extra_cells"
  | "pricing_unavailable"
  | "invalid";

export interface RowIssue {
  field: ImportColumn | null;
  code: RowIssueCode;
  message: string;
  params?: Record<string, string | number>;
}

const ISSUE_MESSAGES: Record<RowIssueCode, string> = {
  required: "This value is required",
  too_short: "Must be at least {min} characters",
  too_long: "Must be at most {max} characters",
  not_a_number: "Enter a number such as 2.5",
  must_be_positive: "Must be greater than 0",
  too_large: "Must be at most {max}",
  too_many_decimals: "Use at most {decimals} decimal places",
  invalid_datetime: "Use a date and time like 2026-12-01T10:00:00+06:00",
  must_be_future: "Pickup must be scheduled in the future",
  dimensions_all_or_none: "Give length, width and height, or leave all three empty",
  extra_cells: "This row has more values than the header has columns",
  pricing_unavailable: "No delivery price is set for this weight",
  invalid: "This value is not valid",
};

export function rowIssue(field: ImportColumn | null, code: RowIssueCode, params?: Record<string, string | number>, message?: string): RowIssue {
  return { field, code, message: message ?? fill(ISSUE_MESSAGES[code], params ?? {}), ...(params ? { params } : {}) };
}

const NUMERIC_COLUMNS: readonly ImportColumn[] = ["parcelWeightKg", "parcelLengthCm", "parcelWidthCm", "parcelHeightCm"];
const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;
const columnOf = (key: unknown): ImportColumn | null => (typeof key === "string" && (IMPORT_COLUMNS as readonly string[]).includes(key) ? (key as ImportColumn) : null);

export type RowResult = { ok: true; input: CreateShipmentInput } | { ok: false; issues: RowIssue[] };

// Checks one row with the same schema the booking form uses. Blank cells are left out so
// optional columns stay optional and required ones report "required".
export function validateRow(row: RawRow): RowResult {
  const issues: RowIssue[] = [];
  if (row.extraCells) issues.push(rowIssue(null, "extra_cells"));
  const candidate: Record<string, string | number> = {};
  const unreadable = new Set<ImportColumn>();
  for (const column of IMPORT_COLUMNS) {
    const value = row.values[column];
    if (value === undefined || value === "") continue;
    if (NUMERIC_COLUMNS.includes(column)) {
      if (PLAIN_DECIMAL.test(value)) candidate[column] = Number(value);
      else {
        unreadable.add(column);
        issues.push(rowIssue(column, "not_a_number"));
      }
    } else {
      candidate[column] = value;
    }
  }

  const parsed = createShipmentSchema.safeParse(candidate);
  if (parsed.success && issues.length === 0) return { ok: true, input: parsed.data };
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = columnOf(issue.path[0]);
      if (field && unreadable.has(field)) continue;
      issues.push(mapZodIssue(field, issue as ZodIssueLike));
    }
  }
  // "tomorrow" fails the format check and then the future check; one message is enough.
  const unreadableDate = issues.some((issue) => issue.field === "pickupScheduledAt" && issue.code === "invalid_datetime");
  return { ok: false, issues: unreadableDate ? issues.filter((issue) => issue.code !== "must_be_future") : issues };
}

interface ZodIssueLike {
  code: string;
  message: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  divisor?: number;
  format?: string;
}

function mapZodIssue(field: ImportColumn | null, issue: ZodIssueLike): RowIssue {
  switch (issue.code) {
    case "invalid_type":
      return rowIssue(field, "required");
    case "too_small":
      if (issue.origin === "string") return rowIssue(field, "too_short", { min: Number(issue.minimum) });
      return rowIssue(field, "must_be_positive");
    case "too_big":
      if (issue.origin === "string") return rowIssue(field, "too_long", { max: Number(issue.maximum) });
      return rowIssue(field, "too_large", { max: Number(issue.maximum) });
    case "not_multiple_of":
      return rowIssue(field, "too_many_decimals", { decimals: Math.max(0, Math.round(-Math.log10(issue.divisor ?? 0.01))) });
    case "invalid_format":
      return rowIssue(field, "invalid_datetime");
    case "custom":
      if (issue.message === "Pickup must be scheduled in the future") return rowIssue(field ?? "pickupScheduledAt", "must_be_future");
      if (issue.message === "Provide all three parcel dimensions or omit them") return rowIssue("parcelLengthCm", "dimensions_all_or_none");
      return rowIssue(field, "invalid", undefined, issue.message);
    default:
      return rowIssue(field, "invalid", undefined, issue.message);
  }
}

export interface DuplicateWarning {
  row: number;
  of: number;
}

// The same pickup and delivery details, recipient phone and weight twice is usually a
// copy-paste slip; it stays a warning because sending two identical parcels is legitimate.
export function findDuplicates(rows: readonly { number: number; input: CreateShipmentInput }[]): DuplicateWarning[] {
  const first = new Map<string, number>();
  const warnings: DuplicateWarning[] = [];
  for (const { number, input } of rows) {
    const key = [input.pickupAddress, input.deliveryAddress, input.deliveryContactPhone, input.parcelWeightKg].join("|").toLowerCase();
    const earlier = first.get(key);
    if (earlier === undefined) first.set(key, number);
    else warnings.push({ row: number, of: earlier });
  }
  return warnings;
}

const SAMPLE_ROWS: Record<ImportColumn, string>[] = [
  {
    pickupContactName: "Rina Akter",
    pickupContactPhone: "01700000001",
    pickupAddress: "House 12, Road 5, Gulshan 1, Dhaka",
    deliveryContactName: "Rahim Uddin",
    deliveryContactPhone: "01800000002",
    deliveryAddress: "Agrabad Commercial Area, Chattogram",
    parcelWeightKg: "2.5",
    packageDescription: "Box of books",
    parcelLengthCm: "30",
    parcelWidthCm: "20",
    parcelHeightCm: "15",
    pickupScheduledAt: "",
  },
];

export function templateCsv() {
  const quote = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [IMPORT_COLUMNS.join(","), ...SAMPLE_ROWS.map((row) => IMPORT_COLUMNS.map((column) => quote(row[column])).join(","))];
  return `${lines.join("\r\n")}\r\n`;
}
