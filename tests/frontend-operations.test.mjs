import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const {
  getAllowedTransitions,
  isNoteRequired,
  isCourierAssignable,
  validateTransitionReadiness,
  statusLabel,
} = await import("../features/shipments/contracts.ts");

test("getAllowedTransitions respects role permissions and workflow steps", () => {
  // Customer can only cancel CREATED shipments
  assert.deepEqual(getAllowedTransitions("CREATED", "CUSTOMER"), ["CANCELLED"]);
  assert.deepEqual(getAllowedTransitions("PICKED_UP", "CUSTOMER"), []);
  assert.deepEqual(getAllowedTransitions("OUT_FOR_DELIVERY", "CUSTOMER"), []);
  assert.deepEqual(getAllowedTransitions("FAILED", "CUSTOMER"), []);

  // Courier transitions through delivery milestones but cannot cancel or handle failed recovery
  assert.deepEqual(getAllowedTransitions("CREATED", "COURIER"), ["PICKED_UP"]);
  assert.deepEqual(getAllowedTransitions("PICKED_UP", "COURIER"), ["IN_TRANSIT"]);
  assert.deepEqual(getAllowedTransitions("IN_TRANSIT", "COURIER"), ["OUT_FOR_DELIVERY"]);
  assert.deepEqual(getAllowedTransitions("OUT_FOR_DELIVERY", "COURIER"), ["DELIVERED", "FAILED"]);
  assert.deepEqual(getAllowedTransitions("FAILED", "COURIER"), []);
  assert.deepEqual(getAllowedTransitions("DELIVERED", "COURIER"), []);

  // Admin has operational authority for all transitions including retry and return
  assert.deepEqual(getAllowedTransitions("CREATED", "ADMIN"), ["PICKED_UP", "CANCELLED"]);
  assert.deepEqual(getAllowedTransitions("OUT_FOR_DELIVERY", "ADMIN"), ["DELIVERED", "FAILED"]);
  assert.deepEqual(getAllowedTransitions("FAILED", "ADMIN"), ["IN_TRANSIT", "RETURNED"]);
  assert.deepEqual(getAllowedTransitions("DELIVERED", "ADMIN"), []);
  assert.deepEqual(getAllowedTransitions("RETURNED", "ADMIN"), []);
  assert.deepEqual(getAllowedTransitions("CANCELLED", "ADMIN"), []);
});

test("isNoteRequired mandates delivery proof, failure reason, or return reason", () => {
  assert.equal(isNoteRequired("DELIVERED"), true);
  assert.equal(isNoteRequired("FAILED"), true);
  assert.equal(isNoteRequired("RETURNED"), true);

  assert.equal(isNoteRequired("PICKED_UP"), false);
  assert.equal(isNoteRequired("IN_TRANSIT"), false);
  assert.equal(isNoteRequired("OUT_FOR_DELIVERY"), false);
  assert.equal(isNoteRequired("CANCELLED"), false);
});

test("isCourierAssignable restricts assignment to CREATED and FAILED status", () => {
  assert.equal(isCourierAssignable("CREATED"), true);
  assert.equal(isCourierAssignable("FAILED"), true);

  assert.equal(isCourierAssignable("PICKED_UP"), false);
  assert.equal(isCourierAssignable("IN_TRANSIT"), false);
  assert.equal(isCourierAssignable("OUT_FOR_DELIVERY"), false);
  assert.equal(isCourierAssignable("DELIVERED"), false);
  assert.equal(isCourierAssignable("RETURNED"), false);
  assert.equal(isCourierAssignable("CANCELLED"), false);
});

test("validateTransitionReadiness enforces confirmed payment and active courier assignment", () => {
  const unassignedUnpaid = {
    status: "CREATED",
    paymentStatus: "PENDING",
    courierId: null,
  };

  // Courier trying to pick up unpaid, unassigned shipment
  const res1 = validateTransitionReadiness(unassignedUnpaid, "PICKED_UP", "COURIER");
  assert.equal(res1.eligible, false);
  assert.match(res1.reason, /payment/i);

  // Paid but unassigned shipment
  const assignedUnpaid = {
    status: "CREATED",
    paymentStatus: "PAID",
    courierId: null,
  };
  const res2 = validateTransitionReadiness(assignedUnpaid, "PICKED_UP", "COURIER");
  assert.equal(res2.eligible, false);
  assert.match(res2.reason, /courier/i);

  // Fully ready shipment (PAID + assigned courier)
  const readyShipment = {
    status: "CREATED",
    paymentStatus: "PAID",
    courierId: "cuid_courier_123",
  };
  const res3 = validateTransitionReadiness(readyShipment, "PICKED_UP", "COURIER");
  assert.equal(res3.eligible, true);

  // Terminal transition check
  const inDelivery = {
    status: "OUT_FOR_DELIVERY",
    paymentStatus: "PAID",
    courierId: "cuid_courier_123",
  };
  const resDelivered = validateTransitionReadiness(inDelivery, "DELIVERED", "COURIER");
  assert.equal(resDelivered.eligible, true);

  // Cancellation does not require courier or payment
  const resCancel = validateTransitionReadiness(unassignedUnpaid, "CANCELLED", "CUSTOMER");
  assert.equal(resCancel.eligible, true);
});

test("statusLabel formats enum values cleanly", () => {
  assert.equal(statusLabel("OUT_FOR_DELIVERY"), "Out for delivery");
  assert.equal(statusLabel("PICKED_UP"), "Picked up");
  assert.equal(statusLabel("DELIVERED"), "Delivered");
  assert.equal(statusLabel("FAILED"), "Failed");
});
