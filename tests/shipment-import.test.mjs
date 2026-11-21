import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const {
  CsvFileError, IMPORT_COLUMNS, IMPORT_MAX_ROWS, findDuplicates, parseCsv, readRows, templateCsv, validateRow,
} = await import("../lib/shipment-import.ts");
const { csvCell, toCsv } = await import("../lib/csv.ts");
const { readLimitedBytes } = await import("../lib/http/multipart.ts");

const HEADER = IMPORT_COLUMNS.join(",");
const GOOD = 'Rina Akter,01700000001,"House 12, Road 5, Gulshan",Rahim Uddin,01800000002,Agrabad Chattogram,2.5,Box of books,,,,';
const file = (...lines) => `${[HEADER, ...lines].join("\r\n")}\r\n`;
const issues = (line) => {
  const result = validateRow(readRows(parseCsv(file(line))).rows[0]);
  assert.equal(result.ok, false, line);
  return result.issues.map((issue) => `${issue.field}:${issue.code}`);
};

test("the parser handles quotes, embedded commas and line breaks, BOM and every line ending", () => {
  assert.deepEqual(parseCsv('a,"b ""q"" c","l1\nl2"\r\n\r\nx,y\n').map((r) => r.cells), [["a", 'b "q" c', "l1\nl2"], [""], ["x", "y"]]);
  assert.deepEqual(parseCsv("﻿a,b\rc,d").map((r) => r.cells), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseCsv("a,b\r\nc,d").map((r) => r.number), [1, 2]);
  // A quote inside an unquoted value stays literal, as spreadsheet apps write 5" boxes.
  assert.deepEqual(parseCsv('5" box,x').map((r) => r.cells), [['5" box', "x"]]);
  assert.deepEqual(parseCsv(""), []);
  // Row numbers follow the spreadsheet: a blank line is still a row, and a multi-line value is one row.
  assert.deepEqual(parseCsv('h\n"l1\nl2"\n\nlast').map((r) => r.number), [1, 2, 3, 4]);
});

test("a file with an unclosed quote, a NUL byte or an oversized value is rejected with a code", () => {
  assert.throws(() => parseCsv('a,"never closed\nb'), (e) => e instanceof CsvFileError && e.code === "unterminated_quote" && e.params.row === 1);
  assert.throws(() => parseCsv("a,b\u0000c"), (e) => e.code === "not_csv");
  assert.throws(() => parseCsv(`a,${"x".repeat(2001)}`), (e) => e.code === "cell_too_long");
});

test("headers match without regard to case, spaces or underscores, and required ones must exist", () => {
  const loose = "Pickup Contact Name,pickup_contact_phone,PICKUPADDRESS,delivery-contact-name,deliveryContactPhone,deliveryAddress,parcel weight kg,Notes\r\nA B,12345,Dhaka road,C D,67890,Chattogram road,1,hello\r\n";
  const parsed = readRows(parseCsv(loose));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].values.parcelWeightKg, "1");
  assert.deepEqual(parsed.unknownColumns, ["Notes"]);
  assert.throws(() => readRows(parseCsv("pickupContactName\r\nx\r\n")), (e) => e.code === "missing_columns" && e.message.includes("parcelWeightKg"));
  assert.throws(() => readRows(parseCsv(`${HEADER},Pickup_Address\r\n`)), (e) => e.code === "duplicate_column");
  assert.throws(() => readRows(parseCsv("")), (e) => e.code === "empty_file");
  assert.throws(() => readRows(parseCsv(`${HEADER}\r\n`)), (e) => e.code === "empty_file");
});

test("blank rows are skipped, row numbers are kept and the row limit is enforced", () => {
  const rows = readRows(parseCsv(file(GOOD, "", ",,,,,,,,,,,", GOOD))).rows;
  assert.deepEqual(rows.map((row) => row.number), [2, 5]);
  const many = Array.from({ length: IMPORT_MAX_ROWS + 1 }, () => GOOD);
  assert.throws(() => readRows(parseCsv(file(...many))), (e) => e.code === "too_many_rows" && e.params.rows === IMPORT_MAX_ROWS + 1);
  assert.equal(readRows(parseCsv(file(...many.slice(0, IMPORT_MAX_ROWS)))).rows.length, IMPORT_MAX_ROWS);
});

test("a valid row becomes booking input; blank optional cells are left out", () => {
  const result = validateRow(readRows(parseCsv(file(GOOD))).rows[0]);
  assert.equal(result.ok, true);
  assert.equal(result.input.pickupAddress, "House 12, Road 5, Gulshan");
  assert.equal(result.input.parcelWeightKg, 2.5);
  assert.equal(result.input.packageDescription, "Box of books");
  assert.equal("parcelLengthCm" in result.input, false);
  assert.equal("pickupScheduledAt" in result.input, false);
  const scheduled = validateRow(readRows(parseCsv(file(`${GOOD}2099-01-01T10:00:00+06:00`))).rows[0]);
  assert.equal(scheduled.ok, true);
  assert.equal(scheduled.input.pickupScheduledAt, "2099-01-01T10:00:00+06:00");
});

test("each kind of row problem is reported with the column and a stable code", () => {
  assert.deepEqual(issues(",1,a,,,,0,,,,,"), [
    "pickupContactName:required", "pickupContactPhone:too_short", "pickupAddress:too_short",
    "deliveryContactName:required", "deliveryContactPhone:required", "deliveryAddress:required", "parcelWeightKg:must_be_positive",
  ]);
  assert.deepEqual(issues('Rina Akter,01700000001,"House 12, Road 5",Rahim Uddin,01800000002,Agrabad Chattogram,2.5555,,,,,'), ["parcelWeightKg:too_many_decimals"]);
  assert.deepEqual(issues('Rina Akter,01700000001,"House 12, Road 5",Rahim Uddin,01800000002,Agrabad Chattogram,2,,30,,,'), ["parcelLengthCm:dimensions_all_or_none"]);
  assert.deepEqual(issues('Rina Akter,01700000001,"House 12, Road 5",Rahim Uddin,01800000002,Agrabad Chattogram,2,,,,,2020-01-01T10:00:00+06:00'), ["pickupScheduledAt:must_be_future"]);
  assert.deepEqual(issues('Rina Akter,01700000001,"House 12, Road 5",Rahim Uddin,01800000002,Agrabad Chattogram,2,,,,,tomorrow'), ["pickupScheduledAt:invalid_datetime"]);
  assert.deepEqual(issues('Rina Akter,01700000001,"House 12, Road 5",Rahim Uddin,01800000002,Agrabad Chattogram,99999999,,,,,'), ["parcelWeightKg:too_large"]);
  assert.deepEqual(issues('Rina Akter,01700000001,"House 12, Road 5",Rahim Uddin,01800000002,Agrabad Chattogram,2,,,,,,extra'), ["null:extra_cells"]);
});

test("weights must be plain decimals; comma decimals, signs and text are not guessed at", () => {
  for (const weight of ["2,5", "-1", "+2", "1e3", "abc", "2 kg"]) {
    const line = `Rina Akter,01700000001,Road 5 Dhaka,Rahim Uddin,01800000002,Agrabad Chattogram,"${weight}",,,,,`;
    assert.deepEqual(issues(line), ["parcelWeightKg:not_a_number"], weight);
  }
  for (const weight of ["0.001", "10", "2.50", "9999999.999"]) {
    const result = validateRow(readRows(parseCsv(file(`Rina Akter,01700000001,Road 5 Dhaka,Rahim Uddin,01800000002,Agrabad Chattogram,${weight},,,,,`))).rows[0]);
    assert.equal(result.ok, true, weight);
  }
});

test("issue messages carry English text with the numbers filled in", () => {
  const result = validateRow(readRows(parseCsv(file(',1,Dhaka road,C D,67890,Chattogram road,1,,,,,'))).rows[0]);
  const byCode = Object.fromEntries(result.issues.map((issue) => [issue.code, issue]));
  assert.equal(byCode.too_short.message, "Must be at least 5 characters");
  assert.equal(byCode.too_short.params.min, 5);
  assert.equal(byCode.required.message, "This value is required");
});

test("formula-escaped cells from the error report are restored when the fixed file is uploaded", () => {
  const exported = toCsv([[...IMPORT_COLUMNS], ["Rina Akter", "+8801700000001", "Road 5 Dhaka", "=SUM(1)", "01800000002", "Agrabad Chattogram", 2, "", "", "", "", ""]]);
  assert.match(exported, /'\+8801700000001/);
  assert.match(exported, /'=SUM\(1\)/);
  const row = readRows(parseCsv(exported)).rows[0];
  assert.equal(row.values.pickupContactPhone, "+8801700000001");
  assert.equal(row.values.deliveryContactName, "=SUM(1)");
  // Only our own prefix is removed; a real apostrophe stays.
  assert.equal(readRows(parseCsv(file("O'Neil,01700000001,Road 5 Dhaka,C D,67890,Chattogram road,1,,,,,"))).rows[0].values.pickupContactName, "O'Neil");
  assert.equal(csvCell("=1+1"), "'=1+1");
});

test("duplicate rows are found as warnings, not errors", () => {
  const rows = readRows(parseCsv(file(GOOD, GOOD, GOOD.replace("Rahim", "Karim")))).rows.map((row) => ({ number: row.number, input: validateRow(row).input }));
  assert.deepEqual(findDuplicates(rows), [{ row: 3, of: 2 }, { row: 4, of: 2 }]);
  assert.deepEqual(findDuplicates(rows.slice(0, 1)), []);
});

test("the template is a valid file that passes its own validation", () => {
  const parsed = readRows(parseCsv(templateCsv()));
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.unknownColumns, []);
  assert.equal(validateRow(parsed.rows[0]).ok, true);
  assert.equal(templateCsv().split("\r\n")[0], HEADER);
});

test("uploads are read up to the size limit and no further", async () => {
  const request = (body, headers = {}) => new Request("http://localhost/upload", { method: "POST", body, headers });
  assert.equal(new TextDecoder().decode(await readLimitedBytes(request("a,b\n1,2"), 100)), "a,b\n1,2");
  await assert.rejects(readLimitedBytes(request("x".repeat(200)), 100), (error) => error.status === 413);
  await assert.rejects(readLimitedBytes(request("x", { "content-length": "999999" }), 100), (error) => error.status === 413);
  await assert.rejects(readLimitedBytes(new Request("http://localhost/upload", { method: "POST" }), 100), (error) => error.status === 400);
});
