import "dotenv/config";
import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

// Real development/test PostgreSQL with isolated fixtures. Route handlers are called directly
// with signed tokens; rate limiting uses the in-process limiter. Background processing is run
// by calling the same function the confirm request, the poll and the sweeper call.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = randomUUID().repeat(2);
process.env.UPSTASH_REDIS_REST_URL = "";
process.env.UPSTASH_REDIS_REST_TOKEN = "";
const { default: prisma } = await import("../lib/prisma.ts");
const { signAccessToken } = await import("../lib/auth/tokens.ts");
const { apiKeyScopeFor } = await import("../lib/merchant/api-keys.ts");
const { IMPORT_COLUMNS, IMPORT_MAX_ROWS } = await import("../lib/shipment-import.ts");
const { advanceShipmentImports, expireShipmentImports } = await import("../services/shipment-import.service.ts");
const uploadRoute = await import("../app/api/v1/shipments/imports/route.ts");
const detailRoute = await import("../app/api/v1/shipments/imports/[id]/route.ts");
const confirmRoute = await import("../app/api/v1/shipments/imports/[id]/confirm/route.ts");
const errorsRoute = await import("../app/api/v1/shipments/imports/[id]/errors/route.ts");

const tag = randomBytes(6).toString("hex");
const users = [];
const createdRules = [];

async function user(role = "CUSTOMER") {
  const created = await prisma.user.create({
    data: { name: `Import ${role}`, email: `import-${role.toLowerCase()}-${tag}-${users.length}@example.com`, passwordHash: "x", role },
    select: { id: true, role: true },
  });
  users.push(created.id);
  return created;
}

const auth = (who) => ({ authorization: `Bearer ${signAccessToken({ userId: who.id, role: who.role })}` });
const HEADER = IMPORT_COLUMNS.join(",");
const row = (name, weight = "2.5", extra = {}) => {
  const values = {
    pickupContactName: name, pickupContactPhone: "01700000001", pickupAddress: `House ${name}, Gulshan Dhaka`,
    deliveryContactName: "Rahim Uddin", deliveryContactPhone: "01800000002", deliveryAddress: `Agrabad ${name} Chattogram`,
    parcelWeightKg: weight, packageDescription: "Books", ...extra,
  };
  return IMPORT_COLUMNS.map((column) => (/[",]/.test(values[column] ?? "") ? `"${values[column]}"` : (values[column] ?? ""))).join(",");
};
const csv = (...lines) => `${[HEADER, ...lines].join("\r\n")}\r\n`;

async function upload(who, content, { type = "multipart", fileName = "shipments.csv" } = {}) {
  let request;
  if (type === "multipart") {
    const form = new FormData();
    form.set("file", new File([content], fileName, { type: "text/csv" }));
    request = new Request("http://localhost/api/v1/shipments/imports", { method: "POST", body: form, headers: auth(who) });
  } else {
    request = new Request(`http://localhost/api/v1/shipments/imports?fileName=${fileName}`, { method: "POST", body: content, headers: { ...auth(who), "content-type": type } });
  }
  const response = await uploadRoute.POST(request);
  return { status: response.status, body: await response.json() };
}
const detail = async (who, id) => {
  const response = await detailRoute.GET(new Request(`http://localhost/api/v1/shipments/imports/${id}`, { headers: auth(who) }), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
};
const confirm = async (who, id) => {
  const response = await confirmRoute.POST(new Request(`http://localhost/api/v1/shipments/imports/${id}/confirm`, { method: "POST", headers: auth(who) }), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
};
const report = async (who, id) => {
  const response = await errorsRoute.GET(new Request(`http://localhost/api/v1/shipments/imports/${id}/errors`, { headers: auth(who) }), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
};
const shipmentsOf = (who) => prisma.shipment.findMany({ where: { customerId: who.id }, orderBy: { createdAt: "asc" } });

try {
  // Bookings need exactly one active rule for the weight. A fresh CI database has none, so
  // the suite adds its own; a database that already prices these weights is left alone.
  const covering = await prisma.pricingRule.count({ where: { isActive: true, minWeightKg: { lte: "2.5" }, maxWeightKg: { gte: "2.5" } } });
  if (covering === 0) {
    createdRules.push((await prisma.pricingRule.create({ data: { name: `Import test rule ${tag}`, minWeightKg: "0.001", maxWeightKg: "9999999.999", baseFee: "100", additionalPerKgFee: "20", currency: "BDT" } })).id);
  }

  const customer = await user();
  const other = await user();
  const admin = await user("ADMIN");
  const courier = await user("COURIER");

  // ---- Preview: every row is checked and priced, nothing is created ----
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const file = csv(
    row("Rina"),
    row("Karim", "1", { pickupScheduledAt: future }),
    row("Rina"), // same details as row 2 of the file: a duplicate warning, still valid
    row("Bad", "abc"),
    row("", "2"),
    row("Heavy", "0.0005"),
  );
  const preview = await upload(customer, file);
  assert.equal(preview.status, 201, JSON.stringify(preview.body));
  const first = preview.body.data;
  assert.equal(first.import.status, "PREVIEW");
  assert.equal(first.import.fileName, "shipments.csv");
  assert.equal(first.import.totalRows, 6);
  assert.equal(first.import.validRows, 3);
  assert.equal(first.import.invalidRows, 3);
  assert.deepEqual(first.problems.map((problem) => problem.row), [5, 6, 7]);
  assert.equal(first.problems[0].issues[0].code, "not_a_number");
  assert.equal(first.problems[0].issues[0].field, "parcelWeightKg");
  assert.ok(first.problems[1].issues.some((issue) => issue.code === "too_short" || issue.code === "required"));
  assert.ok(first.problems[2].issues.some((issue) => issue.field === "parcelWeightKg"));
  assert.deepEqual(first.import.warnings, [{ code: "duplicate_row", row: 4, of: 2 }]);
  assert.equal(first.sample.length, 3);
  assert.ok(first.sample.every((entry) => entry.estimatedPrice && Number(entry.estimatedPrice) > 0));
  assert.equal(first.import.estimatedTotals.length, 1);
  assert.equal((await shipmentsOf(customer)).length, 0, "a preview creates nothing");

  // ---- Access: only the owning customer ----
  assert.equal((await detail(other, first.import.id)).status, 404);
  assert.equal((await confirm(other, first.import.id)).status, 404);
  assert.equal((await report(other, first.import.id)).status, 404);
  for (const who of [admin, courier]) {
    assert.equal((await upload(who, file)).status, 403, who.role);
    assert.equal((await detail(who, first.import.id)).status, 403, who.role);
  }
  const anonymous = await uploadRoute.POST(new Request("http://localhost/api/v1/shipments/imports", { method: "POST", body: file, headers: { "content-type": "text/csv" } }));
  assert.equal(anonymous.status, 401);
  // Merchant API keys never reach these routes.
  for (const [method, path] of [["POST", "/api/v1/shipments/imports"], ["GET", "/api/v1/shipments/imports/abc"], ["POST", "/api/v1/shipments/imports/abc/confirm"], ["GET", "/api/v1/shipments/imports/abc/errors"]]) {
    assert.equal(apiKeyScopeFor(method, path), null, `${method} ${path}`);
  }

  // ---- Bad files are rejected with a code and create nothing ----
  const reject = async (content, expected, options) => {
    const result = await upload(await user(), content, options);
    assert.equal(result.status, expected.status, `${expected.code}: ${JSON.stringify(result.body)}`);
    if (expected.code) assert.equal(result.body.errors[0].code, expected.code);
    return result;
  };
  await reject("pickupContactName\r\nRina\r\n", { status: 400, code: "missing_columns" });
  await reject(`${HEADER}\r\n`, { status: 400, code: "empty_file" });
  await reject(`${HEADER}\r\n"unclosed,quote`, { status: 400, code: "unterminated_quote" });
  await reject(csv(...Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, index) => row(`R${index}`))), { status: 400, code: "too_many_rows" });
  await reject("x".repeat(1024 * 1024 + 10), { status: 413, code: "REQUEST_TOO_LARGE" });
  await reject("a,b", { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" }, { type: "application/json" });
  const badBytes = await upload(await user(), new Uint8Array([0xff, 0xfe, 0xfd, 0x2c, 0xc3]), { type: "text/csv" });
  assert.equal(badBytes.status, 400);
  const asText = await upload(await user(), csv(row("Plain")), { type: "text/csv", fileName: "plain.csv" });
  assert.equal(asText.status, 201);
  assert.equal(asText.body.data.import.fileName, "plain.csv");

  // ---- Rate limit: five uploads an hour ----
  const busy = await user();
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await upload(busy, csv(row(`Rate${attempt}`)))).status, 201, `upload ${attempt}`);
  assert.equal((await upload(busy, csv(row("Rate5")))).status, 429);

  // ---- A new preview replaces the previous unconfirmed one ----
  const second = await upload(customer, csv(row("First"), row("Second"), row("Third")));
  assert.equal(second.status, 201);
  assert.equal((await detail(customer, first.import.id)).status, 404, "the older preview was dropped");

  // ---- Confirm: one atomic start, then rows are created in the background ----
  const started = await confirm(customer, second.body.data.import.id);
  assert.equal(started.status, 202, JSON.stringify(started.body));
  assert.equal(started.body.data.import.status, "PROCESSING");
  assert.equal((await confirm(customer, second.body.data.import.id)).status, 409, "a second confirm is refused");
  assert.equal((await upload(customer, csv(row("Later")))).status, 409, "one import at a time");
  assert.equal((await shipmentsOf(customer)).length, 0, "nothing is created until the background run");

  await advanceShipmentImports({ budgetMs: 60_000 });
  const done = (await detail(customer, second.body.data.import.id)).body.data;
  assert.equal(done.import.status, "DONE");
  assert.equal(done.import.createdCount, 3);
  assert.equal(done.import.failedCount, 0);
  assert.equal(done.import.pendingCount, 0);
  assert.ok(done.import.finishedAt);
  assert.equal(done.createdShipments.length, 3);
  const created = await shipmentsOf(customer);
  assert.equal(created.length, 3);
  assert.ok(created.every((shipment) => shipment.status === "CREATED" && shipment.paymentStatus === "PENDING" && Number(shipment.price) > 0));
  assert.deepEqual(created.map((shipment) => shipment.pickupContactName).sort(), ["First", "Second", "Third"]);
  // Same history and audit as a single booking, but no booking email per row.
  assert.equal(await prisma.shipmentEvent.count({ where: { shipmentId: { in: created.map((s) => s.id) }, type: "CREATED" } }), 3);
  assert.equal(await prisma.auditLog.count({ where: { action: "SHIPMENT_CREATED", shipmentId: { in: created.map((s) => s.id) } } }), 3);
  assert.equal(await prisma.notificationOutbox.count({ where: { shipmentId: { in: created.map((s) => s.id) }, type: "SHIPMENT_BOOKED" } }), 0);
  assert.equal(await prisma.shipmentImportRow.count({ where: { importId: done.import.id, status: "CREATED", shipmentId: { not: null } } }), 3);
  // Running the sweeper again never creates anything twice.
  await advanceShipmentImports({ budgetMs: 5_000 });
  assert.equal((await shipmentsOf(customer)).length, 3);
  assert.equal((await confirm(customer, done.import.id)).status, 409, "a finished import cannot be confirmed again");

  // ---- Concurrent workers never duplicate a shipment ----
  const racer = await user();
  const racing = await upload(racer, csv(...Array.from({ length: 8 }, (_, index) => row(`Race${index}`))));
  assert.equal(racing.status, 201);
  assert.equal((await confirm(racer, racing.body.data.import.id)).status, 202);
  await Promise.all([advanceShipmentImports({ budgetMs: 60_000 }), advanceShipmentImports({ budgetMs: 60_000 })]);
  const raced = await shipmentsOf(racer);
  assert.equal(raced.length, 8, "exactly one shipment per row");
  assert.equal(new Set(raced.map((shipment) => shipment.pickupContactName)).size, 8);
  const racedDetail = (await detail(racer, racing.body.data.import.id)).body.data;
  assert.equal(racedDetail.import.status, "DONE");
  assert.equal(racedDetail.import.createdCount, 8);

  // ---- A row that stopped being valid after the preview fails on its own ----
  const failer = await user();
  const mixed = await upload(failer, csv(row("Stays"), row("Expires", "2", { pickupScheduledAt: future }), row("Broken", "x")));
  assert.equal(mixed.status, 201);
  const mixedId = mixed.body.data.import.id;
  await prisma.shipmentImportRow.updateMany({
    where: { importId: mixedId, rowNumber: 3 },
    data: { data: { ...(await prisma.shipmentImportRow.findFirstOrThrow({ where: { importId: mixedId, rowNumber: 3 } })).data, pickupScheduledAt: "2020-01-01T10:00:00.000Z" } },
  });
  assert.equal((await confirm(failer, mixedId)).status, 202);
  await advanceShipmentImports({ budgetMs: 60_000 });
  const finished = (await detail(failer, mixedId)).body.data;
  assert.equal(finished.import.status, "DONE");
  assert.equal(finished.import.createdCount, 1);
  assert.equal(finished.import.failedCount, 1);
  assert.equal(finished.import.invalidRows, 1);
  assert.deepEqual(finished.problems.map((problem) => [problem.row, problem.status]), [[3, "FAILED"], [4, "INVALID"]]);
  assert.match(finished.problems[0].issues[0].message, /future/i);
  assert.equal((await shipmentsOf(failer)).length, 1);

  // ---- The error report lists the rows that did not make it, ready to fix and re-upload ----
  const sheet = await report(failer, mixedId);
  assert.equal(sheet.status, 200);
  const exported = sheet.body.data.export;
  assert.match(exported.filename, /-errors\.csv$/);
  assert.ok(exported.content.startsWith("﻿"));
  const lines = exported.content.slice(1).trim().split("\r\n");
  assert.equal(lines[0], `${HEADER},row,error`);
  assert.equal(lines.length, 3);
  assert.match(lines[1], /,3,/);
  assert.match(lines[2], /,4,/);
  assert.match(lines[2], /parcelWeightKg: Enter a number/);
  // The file can go straight back in; the report columns are not treated as unknown ones.
  const again = await upload(await user(), exported.content);
  assert.equal(again.status, 201);
  assert.equal(again.body.data.import.warnings.filter((warning) => warning.code === "ignored_columns").length, 0);
  // Formulas in the report are escaped so a spreadsheet does not run them.
  const typist = await user();
  const formula = await upload(typist, csv(row("=cmd|' /C calc'!A0", "=1+1")));
  const formulaReport = await report(typist, formula.body.data.import.id);
  assert.match(formulaReport.body.data.export.content, /'=1\+1/);
  assert.match(formulaReport.body.data.export.content, /'=cmd/);

  // ---- Previews expire after 24 hours ----
  const staleUser = await user();
  const stale = await upload(staleUser, csv(row("Old")));
  const staleId = stale.body.data.import.id;
  await prisma.shipmentImport.update({ where: { id: staleId }, data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } });
  assert.equal((await detail(staleUser, staleId)).status, 410);
  const refused = await confirm(staleUser, staleId);
  assert.equal(refused.status, 410);
  assert.equal(refused.body.errors[0].code, "IMPORT_EXPIRED");
  assert.ok((await expireShipmentImports()).expired >= 1);
  assert.equal(await prisma.shipmentImport.count({ where: { id: staleId } }), 0);
  assert.equal(await prisma.shipmentImportRow.count({ where: { importId: staleId } }), 0, "rows go with their import");

  // ---- A file with no valid row cannot be confirmed ----
  const hopeful = await user();
  const none = await upload(hopeful, csv(row("Nope", "abc")));
  assert.equal(none.body.data.import.validRows, 0);
  const empty = await confirm(hopeful, none.body.data.import.id);
  assert.equal(empty.status, 409);
  assert.equal(empty.body.errors[0].code, "IMPORT_EMPTY");

  // ---- A closed account stops the import and says why on the rows left ----
  const leaver = await user();
  const leaving = await upload(leaver, csv(row("Gone1"), row("Gone2")));
  assert.equal((await confirm(leaver, leaving.body.data.import.id)).status, 202);
  await prisma.user.update({ where: { id: leaver.id }, data: { isActive: false } });
  await advanceShipmentImports({ budgetMs: 30_000 });
  const closed = await prisma.shipmentImport.findUniqueOrThrow({ where: { id: leaving.body.data.import.id } });
  assert.equal(closed.status, "DONE");
  assert.equal(closed.failedCount, 2);
  assert.equal(closed.createdCount, 0);
  assert.equal((await shipmentsOf(leaver)).length, 0);

  console.info("Shipment import integration passed: preview without creating, row problems with codes, duplicate warnings, access rules, file rejection, rate limit, atomic confirm, background creation without duplicates under concurrency, per-row failures, error report round trip, expiry and closed accounts.");
} finally {
  if (users.length) {
    const ids = (await prisma.shipment.findMany({ where: { customerId: { in: users } }, select: { id: true } })).map((shipment) => shipment.id);
    if (ids.length) {
      await prisma.notificationOutbox.deleteMany({ where: { shipmentId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { shipmentId: { in: ids } } });
      await prisma.shipmentEvent.deleteMany({ where: { shipmentId: { in: ids } } });
      await prisma.shipment.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
  if (createdRules.length) await prisma.pricingRule.deleteMany({ where: { id: { in: createdRules } } });
  await prisma.$disconnect();
}
