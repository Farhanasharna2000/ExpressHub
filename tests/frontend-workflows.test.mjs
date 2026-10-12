import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const {
  bookingPayload,
  bookingSchema,
  emptyDraft,
  getAllowedTransitions,
  isCourierAssignable,
  isNoteRequired,
  validateTransitionReadiness,
  statusLabel,
} = await import("../features/shipments/contracts.ts");

const {
  money,
  getIdempotencyKey,
  clearIdempotencyKey,
  savePendingPayment,
  getPendingPayment,
  clearPendingPayment,
} = await import("../features/payments/contracts.ts");

const {
  readUserQuery,
  readAuditLogQuery,
  isShipmentArchivable,
  formatAuditAction,
} = await import("../features/admin/contracts.ts");

// Mock sessionStorage in node test environment
const storage = new Map();
globalThis.sessionStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

test("Workflow 1: Customer booking to verified payment state", () => {
  // 1. Prepare and validate a booking draft
  const draft = {
    ...emptyDraft,
    pickupContactName: "Farhana Sharna",
    pickupContactPhone: "01711112222",
    pickupAddress: "123 Mohakhali DOHS, Dhaka",
    deliveryContactName: "Recipient Smith",
    deliveryContactPhone: "01822223333",
    deliveryAddress: "456 Gulshan Avenue, Dhaka",
    parcelWeightKg: "2.500",
    packageDescription: "Confidential document pouch",
  };

  const payload = bookingPayload(draft);
  const validated = bookingSchema.safeParse(payload);
  assert.equal(validated.success, true);
  assert.equal(payload.parcelWeightKg, 2.5);
  assert.equal(payload.deliveryContactName, "Recipient Smith");

  // 2. Idempotency management for payment initiation
  const shipmentId = "cuid_shipment_001";
  const key1 = getIdempotencyKey(shipmentId);
  const key2 = getIdempotencyKey(shipmentId);
  assert.equal(key1, key2, "Idempotency key must remain identical for retries of the same shipment");

  clearIdempotencyKey(shipmentId);
  const key3 = getIdempotencyKey(shipmentId);
  assert.notEqual(key1, key3, "A new idempotency key must be generated after clearing");

  // 3. Payment recovery tracking
  savePendingPayment({ paymentId: "cuid_pay_001", shipmentId });
  const recovered = getPendingPayment();
  assert.equal(recovered?.paymentId, "cuid_pay_001");
  assert.equal(recovered?.shipmentId, shipmentId);
  clearPendingPayment();
  assert.equal(getPendingPayment(), null);

  // 4. Money formatting
  assert.equal(money("150.00", "BDT"), "BDT 150.00");
  assert.equal(money("45.50", "USD"), "USD 45.50");
});

test("Workflow 2: Courier full delivery lifecycle and prerequisite gating", () => {
  const courierId = "cuid_courier_999";

  // Step 1: Newly created shipment (unpaid) - Courier cannot pick up until paid
  const unpaidShipment = {
    status: "CREATED",
    paymentStatus: "PENDING",
    courierId,
  };
  const pickupCheck1 = validateTransitionReadiness(unpaidShipment, "PICKED_UP", "COURIER");
  assert.equal(pickupCheck1.eligible, false);
  assert.match(pickupCheck1.reason, /payment/i);

  // Step 2: Customer pays shipment
  const paidShipment = {
    ...unpaidShipment,
    paymentStatus: "PAID",
  };
  const pickupCheck2 = validateTransitionReadiness(paidShipment, "PICKED_UP", "COURIER");
  assert.equal(pickupCheck2.eligible, true);

  // Step 3: Courier transitions through delivery milestones
  assert.deepEqual(getAllowedTransitions("CREATED", "COURIER"), ["PICKED_UP"]);
  assert.deepEqual(getAllowedTransitions("PICKED_UP", "COURIER"), ["IN_TRANSIT"]);
  assert.deepEqual(getAllowedTransitions("IN_TRANSIT", "COURIER"), ["OUT_FOR_DELIVERY"]);
  assert.deepEqual(getAllowedTransitions("OUT_FOR_DELIVERY", "COURIER"), ["DELIVERED", "FAILED"]);

  // Step 4: Final delivery note requirement
  assert.equal(isNoteRequired("DELIVERED"), true);
  assert.equal(isNoteRequired("FAILED"), true);

  // Step 5: Terminal state cannot be transitioned further
  assert.deepEqual(getAllowedTransitions("DELIVERED", "COURIER"), []);
});

test("Workflow 3: Admin operations, courier assignment, and archival", () => {
  // Step 1: Courier assignment eligibility
  assert.equal(isCourierAssignable("CREATED"), true);
  assert.equal(isCourierAssignable("FAILED"), true);
  assert.equal(isCourierAssignable("IN_TRANSIT"), false);
  assert.equal(isCourierAssignable("DELIVERED"), false);

  // Step 2: Admin can handle failed deliveries (retry or return)
  assert.deepEqual(getAllowedTransitions("FAILED", "ADMIN"), ["IN_TRANSIT", "RETURNED"]);

  // Step 3: Terminal shipment archival (soft delete)
  assert.equal(isShipmentArchivable("DELIVERED"), true);
  assert.equal(isShipmentArchivable("RETURNED"), true);
  assert.equal(isShipmentArchivable("CANCELLED"), true);
  assert.equal(isShipmentArchivable("IN_TRANSIT"), false);

  // Step 4: Audit log queries and formatting
  assert.equal(formatAuditAction("SHIPMENT_COURIER_ASSIGNED"), "Courier assigned");
  assert.equal(formatAuditAction("SHIPMENT_SOFT_DELETED"), "Soft deleted");
  assert.equal(formatAuditAction("USER_ROLE_UPDATED"), "Role updated");
});

test("Workflow 4: Concurrency and security boundary enforcement", () => {
  // Customer cannot access courier or admin transitions
  assert.deepEqual(getAllowedTransitions("CREATED", "CUSTOMER"), ["CANCELLED"]);
  assert.deepEqual(getAllowedTransitions("PICKED_UP", "CUSTOMER"), []);
  assert.deepEqual(getAllowedTransitions("OUT_FOR_DELIVERY", "CUSTOMER"), []);

  // Courier cannot cancel shipments
  const courierTransitions = getAllowedTransitions("CREATED", "COURIER");
  assert.equal(courierTransitions.includes("CANCELLED"), false);

  // Courier cannot retry or return failed shipments
  assert.deepEqual(getAllowedTransitions("FAILED", "COURIER"), []);

  // User query rejects unauthorized values
  assert.throws(() => readUserQuery(new URLSearchParams("role=UNKNOWN")), /role/i);
});
