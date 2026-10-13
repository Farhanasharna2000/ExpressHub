import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (specifier === "next/server") return next("next/server.js", context);
    if (specifier.startsWith("@/")) return { url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts")) {
      return { format: "module", source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), { mode: "transform" }), shortCircuit: true };
    }
    return next(url, context);
  },
});

const {
  money,
  statusLabel,
  parsePaymentFilters,
  paymentFilterSchema,
  getIdempotencyKey,
  clearIdempotencyKey,
  savePendingPayment,
  getPendingPayment,
  clearPendingPayment,
} = await import("../features/payments/contracts.ts");

// Mock sessionStorage in node test environment
const storage = new Map();
globalThis.sessionStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

test("money formatting preserves server exact decimals without float precision drift", () => {
  assert.equal(money("120.50", "BDT"), "BDT 120.50");
  assert.equal(money("0.05", "USD"), "USD 0.05");
  assert.equal(money("1000000.99", "bdt"), "BDT 1000000.99");
});

test("statusLabel returns expected labels for all payment states", () => {
  assert.equal(statusLabel("PENDING"), "Pending verification");
  assert.equal(statusLabel("PAID"), "Paid");
  assert.equal(statusLabel("FAILED"), "Payment failed");
  assert.equal(statusLabel("REFUND_PENDING"), "Refund pending");
  assert.equal(statusLabel("REFUNDED"), "Refunded");
});

test("parsePaymentFilters accepts supported query parameters and resets invalid values", () => {
  const valid = parsePaymentFilters(new URLSearchParams("page=3&limit=50&status=PAID&shipmentId=cuid123456789012345678901234"));
  assert.equal(valid.page, 3);
  assert.equal(valid.limit, 50);
  assert.equal(valid.status, "PAID");
  assert.equal(valid.shipmentId, "cuid123456789012345678901234");

  const invalid = parsePaymentFilters(new URLSearchParams("page=-5&limit=500&status=UNKNOWN"));
  assert.equal(invalid.page, 1);
  assert.equal(invalid.limit, 10);
  assert.equal(invalid.status, undefined);
});

test("idempotency key is preserved per shipment and regenerated after clearing", () => {
  storage.clear();
  const shipmentA = "shipment_test_aaa";
  const shipmentB = "shipment_test_bbb";

  const key1 = getIdempotencyKey(shipmentA);
  const key2 = getIdempotencyKey(shipmentA);
  assert.equal(key1, key2, "Retries for the same shipment must reuse the exact same idempotency key");

  const keyB = getIdempotencyKey(shipmentB);
  assert.notEqual(key1, keyB, "Different shipments must receive distinct idempotency keys");

  clearIdempotencyKey(shipmentA);
  const fresh = getIdempotencyKey(shipmentA);
  assert.notEqual(key1, fresh, "Clearing idempotency key generates a fresh UUID on next attempt");
});

test("pending payment recovery storage preserves paymentId and cleans up cleanly", () => {
  storage.clear();
  assert.equal(getPendingPayment(), null);

  savePendingPayment({ paymentId: "pay_123", shipmentId: "ship_456", checkoutUrl: "https://checkout.stripe.com/pay" });
  const recovered = getPendingPayment();
  assert.equal(recovered?.paymentId, "pay_123");
  assert.equal(recovered?.shipmentId, "ship_456");

  clearPendingPayment();
  assert.equal(getPendingPayment(), null);
});

let lastDbQuery;
globalThis.prisma = {
  payment: {
    async findFirst(q) {
      lastDbQuery = q;
      if (q.where.payerId === "foreign_customer") return null;
      return {
        id: "pay_test",
        shipmentId: "ship_test",
        payerId: q.where.payerId ?? "customer_owner",
        provider: "STRIPE",
        amount: "250.00",
        currency: "BDT",
        status: "PAID",
        paidAt: new Date(),
        refundedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  },
};

const { getPayment } = await import("../services/payment.service.ts");

test("payment details enforce role ownership and reject couriers and foreign customers", async () => {
  const result = await getPayment({ id: "customer_owner", role: "CUSTOMER" }, "pay_test");
  assert.equal(result.id, "pay_test");
  assert.equal(lastDbQuery.where.payerId, "customer_owner");

  // Courier cannot access payments
  await assert.rejects(
    getPayment({ id: "courier_1", role: "COURIER" }, "pay_test"),
    { status: 403 }
  );

  // Foreign customer cannot view someone else's payment
  await assert.rejects(
    getPayment({ id: "foreign_customer", role: "CUSTOMER" }, "pay_test"),
    { status: 404 }
  );

  // Admin can view any payment
  await getPayment({ id: "admin_1", role: "ADMIN" }, "pay_test");
  assert.equal(lastDbQuery.where.payerId, undefined);
});
