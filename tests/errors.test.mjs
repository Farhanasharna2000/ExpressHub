import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { z } from "zod";
const { AppError, registerTelemetryReporter } = await import("../lib/http/errors.ts");
const { errorResponse, successResponse, tooManyRequestsResponse } = await import("../lib/http/responses.ts");
const { handleRouteError, parseRequestBody } = await import("../lib/auth/route-helpers.ts");

test("shared error handler preserves application status/code and validation field paths", async () => {
  for (const status of [400, 401, 403, 404, 409, 413, 415, 429, 502, 503]) {
    const response = handleRouteError(new AppError(status, "Expected error", "EXPECTED"));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { success: false, message: "Expected error", errors: [{ code: "EXPECTED" }] });
  }
  const result = z.object({ items: z.array(z.object({ name: z.string() })) }).safeParse({ items: [{ name: 123 }] });
  const response = errorResponse(result.error);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.errors[0].path, "items.0.name");
  assert.equal(body.errors[0].input, undefined);
});

test("unexpected errors generate error IDs, log structured telemetry, and shield client responses", async () => {
  const logger = mock.method(console, "error", () => {});
  try {
    const rawError = new Error("secret-password SQL provider-payload");
    const response = handleRouteError(rawError);
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store");

    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.message, "Something went wrong");
    assert.deepEqual(body.errors, [{ code: "INTERNAL_SERVER_ERROR" }]);
    assert.ok(typeof body.incidentId === "string" && body.incidentId.length > 0);
    assert.equal(body.errorId, body.incidentId);
    assert.equal(response.headers.get("x-incident-id"), body.incidentId);
    assert.equal(response.headers.get("x-error-id"), body.incidentId);

    // Client response must never leak the secret details
    const serializedBody = JSON.stringify(body);
    assert.ok(!serializedBody.includes("secret-password"));
    assert.ok(!serializedBody.includes("provider-payload"));

    // Server log must retain structured JSON with incidentId, error message, and stack trace
    assert.equal(logger.mock.calls.length, 1);
    const parsedLog = JSON.parse(logger.mock.calls[0].arguments[0]);
    assert.equal(parsedLog.level, "error");
    assert.equal(parsedLog.incidentId, body.incidentId);
    assert.equal(parsedLog.errorId, body.errorId);
    assert.equal(parsedLog.error.message, "secret-password SQL provider-payload");
    assert.ok(typeof parsedLog.error.stack === "string" && parsedLog.error.stack.includes("secret-password"));
    assert.ok(Number.isFinite(Date.parse(parsedLog.timestamp)));
  } finally {
    logger.mock.restore();
  }
});

test("unexpected errors dispatch APM telemetry and respect correlation IDs", async () => {
  const logger = mock.method(console, "error", () => {});
  const apmCalls = [];
  registerTelemetryReporter((err, ctx) => apmCalls.push({ err, ctx }));
  try {
    const customReq = new Request("http://localhost/api/v1/test", {
      headers: { "x-correlation-id": "custom-trace-uuid-12345" },
    });
    const err = new Error("database deadlock occurred");
    const response = handleRouteError(err, customReq);
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.incidentId, "custom-trace-uuid-12345");
    assert.equal(body.errorId, "custom-trace-uuid-12345");
    assert.equal(response.headers.get("x-incident-id"), "custom-trace-uuid-12345");

    assert.equal(apmCalls.length, 1);
    assert.equal(apmCalls[0].err, err);
    assert.equal(apmCalls[0].ctx.incidentId, "custom-trace-uuid-12345");
    assert.equal(apmCalls[0].ctx.errorId, "custom-trace-uuid-12345");
  } finally {
    registerTelemetryReporter(null);
    logger.mock.restore();
  }
});

test("global Sentry is invoked when no custom APM reporter is registered", async () => {
  const logger = mock.method(console, "error", () => {});
  const sentryCalls = [];
  globalThis.Sentry = {
    captureException: (err, captureContext) => sentryCalls.push({ err, captureContext }),
  };
  try {
    const err = new Error("sentry-captured unexpected error");
    const response = handleRouteError(err);
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(sentryCalls.length, 1);
    assert.equal(sentryCalls[0].err, err);
    assert.equal(sentryCalls[0].captureContext.tags.incidentId, body.incidentId);
    assert.equal(sentryCalls[0].captureContext.tags.errorId, body.errorId);
  } finally {
    delete globalThis.Sentry;
    logger.mock.restore();
  }
});

test("body validation produces consistent errors for malformed, oversized and invalid JSON", async () => {
  const schema = z.object({ name: z.string().min(2) }).strict();
  for (const [body, contentType, status] of [["{", "application/json", 400], ['{"extra":1}', "application/json", 400], ["null", "application/json", 400], ["{}", "text/plain", 415], ["x".repeat(16385), "application/json", 413]]) {
    let error;
    try { await parseRequestBody(new Request("http://localhost", { method: "POST", headers: { "content-type": contentType }, body }), schema); }
    catch (caught) { error = caught; }
    assert.ok(error);
    const response = handleRouteError(error);
    assert.equal(response.status, status);
    assert.ok(Array.isArray((await response.json()).errors));
  }
});

test("success and rate-limit responses preserve their contract and headers", async () => {
  const response = successResponse("Created", { id: "test" }, 201);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { success: true, message: "Created", data: { id: "test" } });
  const limited = tooManyRequestsResponse(Date.now() + 10000);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal((await limited.json()).errors[0].code, "RATE_LIMITED");
});
