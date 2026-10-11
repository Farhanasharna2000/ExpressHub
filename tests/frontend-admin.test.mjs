import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const {
  readUserQuery,
  readAuditLogQuery,
  isShipmentArchivable,
  formatAuditAction,
} = await import("../features/admin/contracts.ts");

test("readUserQuery parses valid filter parameters and resets malformed values", () => {
  const validParams = new URLSearchParams("role=COURIER&isActive=true&q=John&sortBy=name&order=asc&page=2&limit=50");
  const parsed = readUserQuery(validParams);

  assert.equal(parsed.role, "COURIER");
  assert.equal(parsed.isActive, "true");
  assert.equal(parsed.q, "John");
  assert.equal(parsed.sortBy, "name");
  assert.equal(parsed.order, "asc");
  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 50);

  // Rejects invalid role
  const invalidRole = new URLSearchParams("role=SUPERADMIN");
  assert.throws(() => readUserQuery(invalidRole), /role/i);

  // Rejects duplicate query keys
  const duplicateKey = new URLSearchParams("role=COURIER&role=ADMIN");
  assert.throws(() => readUserQuery(duplicateKey), /repeated role/i);
});

test("readAuditLogQuery parses entity types and validates chronological date bounds", () => {
  const validParams = new URLSearchParams(
    "entityType=SHIPMENT&action=STATUS_UPDATED&from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z&page=1&limit=20"
  );
  const parsed = readAuditLogQuery(validParams);

  assert.equal(parsed.entityType, "SHIPMENT");
  assert.equal(parsed.action, "STATUS_UPDATED");
  assert.equal(parsed.from, "2026-01-01T00:00:00Z");
  assert.equal(parsed.to, "2026-01-02T00:00:00Z");

  // Inverted date range (from > to) must fail
  const invertedDates = new URLSearchParams(
    "from=2026-01-05T00:00:00Z&to=2026-01-02T00:00:00Z"
  );
  assert.throws(() => readAuditLogQuery(invertedDates), /from/i);

  // Rejects invalid entity type
  const invalidEntity = new URLSearchParams("entityType=WAREHOUSE");
  assert.throws(() => readAuditLogQuery(invalidEntity), /entityType/i);
});

test("isShipmentArchivable permits soft-deletion only for terminal status shipments", () => {
  // Terminal shipments are archivable
  assert.equal(isShipmentArchivable("DELIVERED"), true);
  assert.equal(isShipmentArchivable("RETURNED"), true);
  assert.equal(isShipmentArchivable("CANCELLED"), true);

  // Active transit or pending states must not be archivable
  assert.equal(isShipmentArchivable("CREATED"), false);
  assert.equal(isShipmentArchivable("PICKED_UP"), false);
  assert.equal(isShipmentArchivable("IN_TRANSIT"), false);
  assert.equal(isShipmentArchivable("OUT_FOR_DELIVERY"), false);
  assert.equal(isShipmentArchivable("FAILED"), false);
});

test("formatAuditAction generates clean readable action strings", () => {
  assert.equal(formatAuditAction("SHIPMENT_STATUS_UPDATED"), "Status updated");
  assert.equal(formatAuditAction("USER_ROLE_UPDATED"), "Role updated");
  assert.equal(formatAuditAction("USER_STATUS_UPDATED"), "Status updated");
  assert.equal(formatAuditAction("SHIPMENT_COURIER_ASSIGNED"), "Courier assigned");
  assert.equal(formatAuditAction("SHIPMENT_SOFT_DELETED"), "Soft deleted");
  assert.equal(formatAuditAction("USER_SOFT_DELETED"), "Soft deleted");
});
