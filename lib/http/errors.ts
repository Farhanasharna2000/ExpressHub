import "server-only";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class RateLimitError extends AppError {
  constructor(public readonly reset: number) {
    super(429, "Too many requests. Please try again later.", "RATE_LIMITED");
  }
}

export interface ErrorResponseOptions {
  correlationId?: string;
}

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

// Caller-supplied IDs are echoed in bodies, headers, logs and APM tags, so only
// short, plain IDs are kept; anything else gets a fresh UUID.
export function safeCorrelationId(value: string | null | undefined) {
  return value && CORRELATION_ID_PATTERN.test(value) ? value : randomUUID();
}

export function requestCorrelationId(headers: Headers) {
  return safeCorrelationId(headers.get("x-correlation-id") || headers.get("x-request-id"));
}

export type TelemetryReporter = (
  error: unknown,
  context: { incidentId: string; errorId: string },
) => void;

let activeReporter: TelemetryReporter | null = null;

/**
 * Configure or mock external APM error reporting (e.g. Sentry, OpenTelemetry, Datadog).
 */
export function registerTelemetryReporter(reporter: TelemetryReporter | null) {
  activeReporter = reporter;
}

/**
 * Dispatches unhandled exception telemetry to registered reporter or global Sentry.
 */
export function captureUnhandledException(
  error: unknown,
  context: { incidentId: string; errorId: string },
) {
  if (activeReporter) {
    try {
      activeReporter(error, context);
    } catch {
      // APM failures must never prevent responding to the client
    }
    return;
  }

  // Automatic Sentry detection if Sentry SDK is initialized globally
  const globalSentry = (globalThis as unknown as {
    Sentry?: {
      captureException: (err: unknown, captureContext?: unknown) => void;
    };
  }).Sentry;

  if (typeof globalSentry?.captureException === "function") {
    try {
      globalSentry.captureException(error, {
        tags: {
          incidentId: context.incidentId,
          errorId: context.errorId,
        },
        extra: {
          incidentId: context.incidentId,
          errorId: context.errorId,
        },
      });
    } catch {
      // Guard against external APM failures
    }
  }
}

export function toErrorResponse(error: unknown, options?: ErrorResponseOptions) {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        success: false,
        message: "Request validation failed",
        errors: error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })),
      },
    };
  }
  if (error instanceof AppError) {
    return {
      body: {
        success: false,
        message: error.message,
        errors: error.details ?? [{ code: error.code }],
      },
      status: error.status,
    };
  }

  // Generate unique correlation identifier
  const incidentId = safeCorrelationId(options?.correlationId);
  const errorId = incidentId;

  // Extract error details safely for internal diagnostic logging
  const errorObj = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unhandled error");
  const errorName = errorObj.name || "Error";
  const errorMessage = errorObj.message || "Unknown error";
  const errorStack = errorObj.stack;

  // Log incident identifier, error message, and full stack trace in structured JSON to standard error
  const logPayload = {
    level: "error",
    message: "Unhandled API error",
    incidentId,
    errorId,
    error: {
      name: errorName,
      message: errorMessage,
      stack: errorStack,
    },
    timestamp: new Date().toISOString(),
  };

  console.error(JSON.stringify(logPayload));

  // Forward to APM telemetry (Sentry / OpenTelemetry)
  captureUnhandledException(error, { incidentId, errorId });

  // Return opaque incident and error IDs in client response for customer support triage
  return {
    body: {
      success: false,
      message: "Something went wrong",
      incidentId,
      errorId,
      errors: [{ code: "INTERNAL_SERVER_ERROR" }],
    },
    status: 500,
  };
}
