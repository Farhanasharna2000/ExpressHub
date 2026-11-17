import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const { AppError } = await import("../lib/http/errors.ts");
const { mapPaymentError, handlePaymentError } = await import(
  "../services/payment.controller.ts"
);

test("mapPaymentError maps AppErrors with NotFound codes to HTTP 404", () => {
  for (const code of [
    "NOT_FOUND",
    "PAYMENT_NOT_FOUND",
    "SHIPMENT_NOT_FOUND",
    "USER_NOT_FOUND",
    "RESOURCE_NOT_FOUND",
  ]) {
    const error400 = new AppError(400, "Collapsed error", code);
    const mapped = mapPaymentError(error400);
    assert.ok(mapped instanceof AppError);
    assert.equal(mapped.status, 404);
    assert.equal(mapped.code, code);
    assert.equal(mapped.message, "Collapsed error");

    // Pre-existing 404 is preserved
    const error404 = new AppError(404, "Already 404", code);
    const preserved = mapPaymentError(error404);
    assert.equal(preserved.status, 404);
  }
});

test("mapPaymentError maps AppErrors with Conflict codes to HTTP 409", () => {
  for (const code of [
    "CONFLICT",
    "PAYMENT_CONFLICT",
    "SHIPMENT_CONFLICT",
    "USER_CONFLICT",
  ]) {
    const error400 = new AppError(400, "Collapsed error", code);
    const mapped = mapPaymentError(error400);
    assert.ok(mapped instanceof AppError);
    assert.equal(mapped.status, 409);
    assert.equal(mapped.code, code);
    assert.equal(mapped.message, "Collapsed error");

    // Pre-existing 409 is preserved
    const error409 = new AppError(409, "Already 409", code);
    const preserved = mapPaymentError(error409);
    assert.equal(preserved.status, 409);
  }
});

test("mapPaymentError maps Prisma known request errors to 404 and 409", () => {
  const p2025 = new Prisma.PrismaClientKnownRequestError(
    "Record not found in database",
    { code: "P2025", clientVersion: "5.22.0" },
  );
  const mappedP2025 = mapPaymentError(p2025);
  assert.ok(mappedP2025 instanceof AppError);
  assert.equal(mappedP2025.status, 404);
  assert.equal(mappedP2025.code, "NOT_FOUND");

  const p2002 = new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed",
    { code: "P2002", clientVersion: "5.22.0" },
  );
  const mappedP2002 = mapPaymentError(p2002);
  assert.ok(mappedP2002 instanceof AppError);
  assert.equal(mappedP2002.status, 409);
  assert.equal(mappedP2002.code, "CONFLICT");

  const p2034 = new Prisma.PrismaClientKnownRequestError(
    "Transaction failed due to a write conflict",
    { code: "P2034", clientVersion: "5.22.0" },
  );
  const mappedP2034 = mapPaymentError(p2034);
  assert.ok(mappedP2034 instanceof AppError);
  assert.equal(mappedP2034.status, 409);
  assert.equal(mappedP2034.code, "CONFLICT");
});

test("mapPaymentError maps a Prisma transaction timeout to a retryable 503", () => {
  const p2028 = new Prisma.PrismaClientKnownRequestError(
    "Transaction already closed",
    { code: "P2028", clientVersion: "5.22.0" },
  );
  const mapped = mapPaymentError(p2028);
  assert.ok(mapped instanceof AppError);
  assert.equal(mapped.status, 503);
  assert.equal(mapped.code, "PAYMENT_RETRY");
});

test("unknown errors are never mapped to 4xx from their message text", async () => {
  for (const error of [
    new Error("Environment variable not found: DATABASE_URL"),
    new Error("Payment conflict occurred"),
    Object.assign(new Error("Payment record does not exist"), { name: "NotFoundError" }),
  ]) {
    assert.equal(mapPaymentError(error), error);
  }
  const logger = mock.method(console, "error", () => {});
  try {
    const response = handlePaymentError(new Error("Environment variable not found: DATABASE_URL"));
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.message, "Something went wrong");
    assert.equal(JSON.stringify(body).includes("DATABASE_URL"), false);
  } finally {
    logger.mock.restore();
  }
});

test("mapPaymentError preserves validation, forbidden, unauthenticated, and rate limit errors", () => {
  const authErr = new AppError(401, "Sign in required", "UNAUTHENTICATED");
  assert.equal(mapPaymentError(authErr).status, 401);

  const forbiddenErr = new AppError(403, "Access denied", "FORBIDDEN");
  assert.equal(mapPaymentError(forbiddenErr).status, 403);

  const serviceErr = new AppError(503, "Unavailable", "RATE_LIMIT_UNAVAILABLE");
  assert.equal(mapPaymentError(serviceErr).status, 503);
});

test("handlePaymentError returns properly shaped HTTP responses for all error types", async () => {
  // 1. NotFound -> 404
  const res404 = handlePaymentError(
    new AppError(400, "Shipment not found", "SHIPMENT_NOT_FOUND"),
  );
  assert.equal(res404.status, 404);
  assert.equal(res404.headers.get("cache-control"), "no-store");
  const body404 = await res404.json();
  assert.equal(body404.success, false);
  assert.equal(body404.message, "Shipment not found");
  assert.deepEqual(body404.errors, [{ code: "SHIPMENT_NOT_FOUND" }]);

  // 2. Conflict -> 409
  const res409 = handlePaymentError(
    new AppError(400, "Payment conflict", "PAYMENT_CONFLICT"),
  );
  assert.equal(res409.status, 409);
  const body409 = await res409.json();
  assert.equal(body409.success, false);
  assert.equal(body409.message, "Payment conflict");
  assert.deepEqual(body409.errors, [{ code: "PAYMENT_CONFLICT" }]);

  // 3. Zod validation error -> 400
  const validation = z.object({ shipmentId: z.string().cuid() }).safeParse({});
  assert.equal(validation.success, false);
  const res400 = handlePaymentError(validation.error);
  assert.equal(res400.status, 400);
  const body400 = await res400.json();
  assert.equal(body400.success, false);
  assert.equal(body400.message, "Request validation failed");

  // 4. Unexpected error -> 500 without leaking details
  const logger = mock.method(console, "error", () => {});
  try {
    const res500 = handlePaymentError(new Error("secret_key_provider_leak"));
    assert.equal(res500.status, 500);
    const body500 = await res500.json();
    assert.equal(body500.success, false);
    assert.equal(body500.message, "Something went wrong");
    assert.deepEqual(body500.errors, [{ code: "INTERNAL_SERVER_ERROR" }]);
  } finally {
    logger.mock.restore();
  }
});
