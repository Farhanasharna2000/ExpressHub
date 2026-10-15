import "server-only";

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { AppError } from "@/lib/http/errors";
import { uniqueQueryParameters } from "@/lib/http/query";
import { successResponse, tooManyRequestsResponse } from "@/lib/http/responses";
import { limitApiRequests } from "@/lib/rate-limit";
import {
  getPayment,
  initiatePayment,
  listMyPayments,
} from "@/services/payment.service";
import {
  initiatePaymentSchema,
  listPaymentsSchema,
  paymentIdSchema,
  paymentIdempotencySchema,
} from "@/validators/payment";

/**
 * Maps payment operational errors to granular HTTP status codes:
 * - 404 for NotFound (missing payment, missing shipment, record not found)
 * - 409 for Conflict (idempotency key conflicts, state conflicts, concurrent updates)
 * - 403 for Forbidden (unauthorized access)
 * - 400 for Bad Request (validation errors, malformed data)
 * - 503 for Service Unavailable (rate limiter outage, provider timeout)
 */
export function mapPaymentError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return new AppError(404, "Resource not found", "NOT_FOUND");
    }
    if (error.code === "P2002") {
      return new AppError(
        409,
        "Payment resource conflict; duplicate entry",
        "CONFLICT",
      );
    }
    if (error.code === "P2034") {
      return new AppError(
        409,
        "Concurrent modification conflict; please retry",
        "CONFLICT",
      );
    }
  }

  if (error instanceof AppError) {
    // Explicit status code mappings (404 for NotFound, 409 for Conflict)
    if (
      error.code === "NOT_FOUND" ||
      error.code === "PAYMENT_NOT_FOUND" ||
      error.code === "SHIPMENT_NOT_FOUND" ||
      error.code === "USER_NOT_FOUND" ||
      error.code === "RESOURCE_NOT_FOUND"
    ) {
      if (error.status !== 404) {
        return new AppError(404, error.message, error.code, error.details);
      }
      return error;
    }

    if (
      error.code === "CONFLICT" ||
      error.code === "PAYMENT_CONFLICT" ||
      error.code === "SHIPMENT_CONFLICT" ||
      error.code === "USER_CONFLICT"
    ) {
      if (error.status !== 409) {
        return new AppError(409, error.message, error.code, error.details);
      }
      return error;
    }

    return error;
  }

  if (error && typeof error === "object") {
    const err = error as { code?: unknown; name?: unknown; message?: unknown };
    const code = typeof err.code === "string" ? err.code : "";
    const name = typeof err.name === "string" ? err.name : "";
    const message = typeof err.message === "string" ? err.message : "";

    if (
      code === "NOT_FOUND" ||
      code === "PAYMENT_NOT_FOUND" ||
      code === "SHIPMENT_NOT_FOUND" ||
      name === "NotFoundError" ||
      name === "RecordNotFound" ||
      /not found/i.test(message)
    ) {
      return new AppError(
        404,
        message || "Resource not found",
        code || "NOT_FOUND",
      );
    }

    if (
      code === "CONFLICT" ||
      code === "PAYMENT_CONFLICT" ||
      name === "ConflictError" ||
      /conflict/i.test(message)
    ) {
      return new AppError(
        409,
        message || "Resource conflict",
        code || "CONFLICT",
      );
    }
  }

  return error;
}

/**
 * Handles route errors for payment endpoints, applying explicit status code mappings.
 */
export function handlePaymentError(error: unknown) {
  return handleRouteError(mapPaymentError(error));
}

/**
 * Create Stripe Checkout from the shipment's trusted server-side quote.
 * A stable UUID Idempotency-Key is mandatory to make retries safe.
 */
export async function createPayment(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "CUSTOMER");
    let limit;
    try {
      limit = await limitApiRequests(actor.id, "payments:initiate", 20);
    } catch {
      throw new AppError(
        503,
        "Payment initiation is temporarily unavailable",
        "RATE_LIMIT_UNAVAILABLE",
      );
    }
    if (!limit.success) return tooManyRequestsResponse(limit.reset);
    const key = paymentIdempotencySchema.parse(
      request.headers.get("idempotency-key"),
    );
    const input = await parseRequestBody(request, initiatePaymentSchema);
    return successResponse(
      "Payment checkout prepared",
      await initiatePayment(actor, input.shipmentId, key),
    );
  } catch (error) {
    return handlePaymentError(error);
  }
}

/** Tenant-style authenticated payment history, filtered to the caller. */
export async function getUserPaymentHistory(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const input = listPaymentsSchema.parse(
      uniqueQueryParameters(request.nextUrl.searchParams),
    );
    return successResponse(
      "Payments fetched successfully",
      await listMyPayments(actor, input),
    );
  } catch (error) {
    return handlePaymentError(error);
  }
}

/** Fetch an individual payment by ID for the authorized owner or admin. */
export async function getPaymentById(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser(request);
    const id = paymentIdSchema.parse((await context.params).id);
    return successResponse("Payment fetched successfully", {
      payment: await getPayment(actor, id),
    });
  } catch (error) {
    return handlePaymentError(error);
  }
}
