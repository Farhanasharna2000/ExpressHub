import "server-only";
import { Prisma, type ShipmentImport, type ShipmentImportRow } from "@prisma/client";
import { after } from "next/server";
import { requireRole, type AuthenticatedUser } from "@/lib/auth/require-user";
import { toCsv } from "@/lib/csv";
import { AppError } from "@/lib/http/errors";
import { quoteWithRules } from "@/lib/pricing-quote";
import prisma from "@/lib/prisma";
import {
  CsvFileError, IMPORT_COLUMNS, IMPORT_CREATED_LIMIT, IMPORT_MAX_BYTES, IMPORT_PREVIEW_TTL_MS, IMPORT_PROBLEM_LIMIT,
  IMPORT_SAMPLE_LIMIT, findDuplicates, parseCsv, readRows, rowIssue, validateRow,
  type ImportColumn, type ImportDetail, type ImportProblem, type ImportStatus, type ImportSummary, type ImportWarning, type RowIssue,
} from "@/lib/shipment-import";
import { createShipment } from "@/services/shipment.service";
import { dispatchPendingWebhooks } from "@/services/webhooks/outbox";
import { createShipmentSchema } from "@/validators/shipment";

const BATCH_SIZE = 25;
const BATCH_BUDGET_MS = 40_000;
// A processing import that has not moved for this long is picked up again by the next poll.
const STALL_MS = 20_000;

const notFound = () => new AppError(404, "Import not found", "IMPORT_NOT_FOUND");

async function requireCustomer(actor: AuthenticatedUser) {
  const user = await prisma.user.findFirst({
    where: { id: actor.id, isActive: true, deletedAt: null },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
  return requireRole(user, "CUSTOMER");
}

function cleanFileName(value: string | undefined) {
  const name = (value ?? "").replace(/[\\/]/g, "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);
  return name || "shipments.csv";
}

function decodeCsv(bytes: Uint8Array | string) {
  if (typeof bytes === "string") return bytes;
  if (bytes.byteLength > IMPORT_MAX_BYTES) throw new AppError(413, "The file is larger than 1 MB", "REQUEST_TOO_LARGE");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AppError(400, "The file is not UTF-8 text. Save it as CSV UTF-8 and try again.", "CSV_INVALID", [{ code: "not_csv" }]);
  }
}

function fileError(error: unknown): never {
  if (error instanceof CsvFileError) throw new AppError(400, error.message, "CSV_INVALID", [{ code: error.code, params: error.params }]);
  throw error;
}

// Nothing is created here. Every row is checked and priced so the customer can fix problems
// before confirming; the rows are stored so confirming does not need the file again.
export async function previewImport(actor: AuthenticatedUser, input: { fileName?: string; content: Uint8Array | string }) {
  const user = await requireCustomer(actor);
  let parsed;
  try {
    parsed = readRows(parseCsv(decodeCsv(input.content)));
  } catch (error) {
    fileError(error);
  }
  if (await prisma.shipmentImport.count({ where: { userId: user.id, status: "PROCESSING" } })) {
    throw new AppError(409, "An import is still running. Wait for it to finish before uploading another file.", "IMPORT_IN_PROGRESS");
  }

  const now = new Date();
  const rules = await prisma.pricingRule.findMany({
    where: { isActive: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
  });

  const rows: Prisma.ShipmentImportRowCreateManyInput[] = [];
  const valid: { number: number; input: NonNullable<Extract<ReturnType<typeof validateRow>, { ok: true }>["input"]> }[] = [];
  for (const row of parsed.rows) {
    const result = validateRow(row);
    if (result.ok) {
      try {
        const quote = quoteWithRules(rules, new Prisma.Decimal(result.input.parcelWeightKg));
        rows.push({
          importId: "",
          rowNumber: row.number,
          status: "PENDING",
          data: result.input as Prisma.InputJsonObject,
          estimatedPrice: quote.price,
          currency: quote.currency,
        });
        valid.push({ number: row.number, input: result.input });
        continue;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        rows.push({
          importId: "",
          rowNumber: row.number,
          status: "INVALID",
          data: row.values as Prisma.InputJsonObject,
          errors: [rowIssue("parcelWeightKg", "pricing_unavailable")] as unknown as Prisma.InputJsonArray,
        });
        continue;
      }
    }
    rows.push({
      importId: "",
      rowNumber: row.number,
      status: "INVALID",
      data: row.values as Prisma.InputJsonObject,
      errors: result.issues as unknown as Prisma.InputJsonArray,
    });
  }

  const warnings: ImportWarning[] = findDuplicates(valid).map((duplicate) => ({ code: "duplicate_row", ...duplicate }));
  if (parsed.unknownColumns.length) warnings.push({ code: "ignored_columns", columns: parsed.unknownColumns });

  const created = await prisma.$transaction(
    async (tx) => {
      // Only the latest preview matters; older unconfirmed ones are dropped.
      await tx.shipmentImport.deleteMany({ where: { userId: user.id, status: "PREVIEW" } });
      const record = await tx.shipmentImport.create({
        data: {
          userId: user.id,
          fileName: cleanFileName(input.fileName),
          totalRows: rows.length,
          validRows: valid.length,
          warnings: warnings as unknown as Prisma.InputJsonArray,
        },
      });
      await tx.shipmentImportRow.createMany({ data: rows.map((row) => ({ ...row, importId: record.id })) });
      return record;
    },
    { timeout: 30_000 },
  );
  return getImport(actor, created.id);
}

async function ownedImport(userId: string, id: string) {
  const record = await prisma.shipmentImport.findFirst({ where: { id, userId } });
  if (!record) throw notFound();
  return record;
}

function isExpired(record: Pick<ShipmentImport, "status" | "createdAt">, now = Date.now()) {
  return record.status === "PREVIEW" && now - record.createdAt.getTime() > IMPORT_PREVIEW_TTL_MS;
}

const expired = () => new AppError(410, "This preview has expired. Upload the file again.", "IMPORT_EXPIRED");

export async function getImport(actor: AuthenticatedUser, id: string): Promise<ImportDetail> {
  const user = await requireCustomer(actor);
  const record = await ownedImport(user.id, id);
  if (isExpired(record)) throw expired();

  const [counts, totals, problemRows, problemsTotal, sampleRows, createdRows] = await Promise.all([
    prisma.shipmentImportRow.groupBy({ by: ["status"], where: { importId: id }, _count: true }),
    prisma.shipmentImportRow.groupBy({ by: ["currency"], where: { importId: id, estimatedPrice: { not: null } }, _sum: { estimatedPrice: true } }),
    prisma.shipmentImportRow.findMany({
      where: { importId: id, status: { in: ["INVALID", "FAILED"] } },
      orderBy: { rowNumber: "asc" },
      take: IMPORT_PROBLEM_LIMIT,
    }),
    prisma.shipmentImportRow.count({ where: { importId: id, status: { in: ["INVALID", "FAILED"] } } }),
    prisma.shipmentImportRow.findMany({
      where: { importId: id, status: { in: ["PENDING", "CREATED"] } },
      orderBy: { rowNumber: "asc" },
      take: IMPORT_SAMPLE_LIMIT,
    }),
    prisma.shipmentImportRow.findMany({
      where: { importId: id, status: "CREATED", shipmentId: { not: null } },
      orderBy: { rowNumber: "asc" },
      take: IMPORT_CREATED_LIMIT,
      select: { rowNumber: true, shipment: { select: { id: true, trackingNumber: true } } },
    }),
  ]);

  const count = (status: string) => counts.find((entry) => entry.status === status)?._count ?? 0;
  const stalled = record.status === "PROCESSING" && Date.now() - record.updatedAt.getTime() > STALL_MS;
  if (stalled) scheduleImportProcessing();

  return {
    import: {
      id: record.id,
      fileName: record.fileName,
      status: record.status as ImportStatus,
      totalRows: record.totalRows,
      validRows: record.validRows,
      invalidRows: count("INVALID"),
      createdCount: count("CREATED"),
      failedCount: count("FAILED"),
      pendingCount: count("PENDING"),
      estimatedTotals: totals
        .filter((entry): entry is typeof entry & { currency: string } => entry.currency !== null)
        .map((entry) => ({ currency: entry.currency, amount: (entry._sum.estimatedPrice ?? new Prisma.Decimal(0)).toFixed(2) })),
      warnings: (record.warnings ?? []) as unknown as ImportWarning[],
      createdAt: record.createdAt.toISOString(),
      confirmedAt: record.confirmedAt?.toISOString() ?? null,
      finishedAt: record.finishedAt?.toISOString() ?? null,
    } satisfies ImportSummary,
    problems: problemRows.map(toProblem),
    problemsTotal,
    sample: sampleRows.map(toSample),
    createdShipments: createdRows.flatMap((row) => (row.shipment ? [{ row: row.rowNumber, id: row.shipment.id, trackingNumber: row.shipment.trackingNumber }] : [])),
  };
}

function toProblem(row: ShipmentImportRow): ImportProblem {
  return { row: row.rowNumber, status: row.status === "FAILED" ? "FAILED" : "INVALID", issues: (row.errors ?? []) as unknown as RowIssue[] };
}

function toSample(row: ShipmentImportRow) {
  const data = row.data as Record<string, unknown>;
  return {
    row: row.rowNumber,
    deliveryContactName: String(data.deliveryContactName ?? ""),
    deliveryAddress: String(data.deliveryAddress ?? ""),
    parcelWeightKg: Number(data.parcelWeightKg ?? 0),
    estimatedPrice: row.estimatedPrice?.toFixed(2) ?? null,
    currency: row.currency,
  };
}

// PREVIEW to PROCESSING in one conditional update, so a double click or a second tab
// cannot start the same import twice. The rows are created in the background.
export async function confirmImport(actor: AuthenticatedUser, id: string) {
  const user = await requireCustomer(actor);
  if (await prisma.shipmentImport.count({ where: { userId: user.id, status: "PROCESSING" } })) {
    throw new AppError(409, "An import is still running. Wait for it to finish.", "IMPORT_IN_PROGRESS");
  }
  const now = new Date();
  const updated = await prisma.shipmentImport.updateMany({
    where: { id, userId: user.id, status: "PREVIEW", validRows: { gt: 0 }, createdAt: { gt: new Date(now.getTime() - IMPORT_PREVIEW_TTL_MS) } },
    data: { status: "PROCESSING", confirmedAt: now },
  });
  if (updated.count !== 1) {
    const record = await ownedImport(user.id, id);
    if (record.status !== "PREVIEW") throw new AppError(409, "This import was already confirmed", "IMPORT_CONFLICT");
    if (record.validRows === 0) throw new AppError(409, "There are no valid rows to create", "IMPORT_EMPTY");
    throw expired();
  }
  await prisma.auditLog.create({
    data: { actorId: user.id, entityType: "USER", entityId: user.id, action: "SHIPMENT_IMPORT_CONFIRMED", details: { importId: id } },
  });
  scheduleImportProcessing();
  return getImport(actor, id);
}

// Raised inside the creation transaction when another worker already created this row,
// which rolls the duplicate shipment back.
class RowAlreadyHandled extends Error {}

function failureOf(error: unknown): RowIssue {
  if (error instanceof AppError) return { field: null, code: "invalid", message: error.message };
  console.error("Shipment import row failed", error instanceof Error ? error.message : error);
  return { field: null, code: "invalid", message: "The shipment could not be created. Try again later." };
}

async function createRow(user: { id: string; name: string; email: string; role: "CUSTOMER" }, row: ShipmentImportRow) {
  const parsed = createShipmentSchema.safeParse(row.data);
  if (!parsed.success) {
    // The pickup time in the file has passed since the preview, for example.
    const issue = parsed.error.issues[0];
    await prisma.shipmentImportRow.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: {
        status: "FAILED",
        errors: [{ field: issue?.path[0] === undefined ? null : String(issue.path[0]), code: "invalid", message: issue?.message ?? "Row is no longer valid" }],
      },
    });
    return "failed" as const;
  }
  try {
    await createShipment(user, parsed.data, {
      onCreated: async (tx, shipment) => {
        const claimed = await tx.shipmentImportRow.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "CREATED", shipmentId: shipment.id } });
        if (claimed.count !== 1) throw new RowAlreadyHandled();
        // A booking email per row would flood the customer's inbox and the email quota; the
        // import page lists every created shipment instead. Later status emails still go out.
        await tx.notificationOutbox.deleteMany({ where: { shipmentId: shipment.id, type: "SHIPMENT_BOOKED" } });
      },
    });
    return "created" as const;
  } catch (error) {
    if (error instanceof RowAlreadyHandled) return "skipped" as const;
    await prisma.shipmentImportRow.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: "FAILED", errors: [failureOf(error)] as unknown as Prisma.InputJsonArray },
    });
    return "failed" as const;
  }
}

async function refreshCounts(importId: string, finish: boolean) {
  const [created, failed, pending] = await Promise.all([
    prisma.shipmentImportRow.count({ where: { importId, status: "CREATED" } }),
    prisma.shipmentImportRow.count({ where: { importId, status: "FAILED" } }),
    prisma.shipmentImportRow.count({ where: { importId, status: "PENDING" } }),
  ]);
  const done = finish || pending === 0;
  await prisma.shipmentImport.update({
    where: { id: importId },
    data: { createdCount: created, failedCount: failed, ...(done ? { status: "DONE", finishedAt: new Date() } : {}) },
  });
  return { created, failed, pending, done };
}

async function processBatch(record: ShipmentImport, deadline: number) {
  const user = await prisma.user.findFirst({
    where: { id: record.userId, isActive: true, deletedAt: null, role: "CUSTOMER" },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    // The account was closed mid-import: stop and say why on every row left.
    await prisma.shipmentImportRow.updateMany({
      where: { importId: record.id, status: "PENDING" },
      data: { status: "FAILED", errors: [{ field: null, code: "invalid", message: "The account is no longer active" }] },
    });
    await refreshCounts(record.id, true);
    return 0;
  }
  const rows = await prisma.shipmentImportRow.findMany({
    where: { importId: record.id, status: "PENDING" },
    orderBy: { rowNumber: "asc" },
    take: BATCH_SIZE,
  });
  let handled = 0;
  for (const row of rows) {
    if (Date.now() > deadline) break;
    await createRow({ ...user, role: "CUSTOMER" }, row);
    handled += 1;
  }
  const progress = await refreshCounts(record.id, false);
  // Merchants with webhooks hear about each new shipment; failures are retried by the sweeper.
  if (handled > 0) await dispatchPendingWebhooks().catch((error) => console.error("Webhook dispatch failed", error instanceof Error ? error.message : error));
  return progress.pending === 0 ? 0 : handled;
}

// Creates the next rows of every confirmed import until the time budget is used. Safe to
// run from several places at once: a row is claimed inside its own creation transaction.
export async function advanceShipmentImports(options: { budgetMs?: number } = {}) {
  const deadline = Date.now() + (options.budgetMs ?? BATCH_BUDGET_MS);
  let batches = 0;
  while (Date.now() < deadline) {
    const record = await prisma.shipmentImport.findFirst({ where: { status: "PROCESSING" }, orderBy: { updatedAt: "asc" } });
    if (!record) break;
    const handled = await processBatch(record, deadline);
    batches += 1;
    if (handled === 0) {
      // Nothing left to create (or the account is gone): make sure the import is closed.
      const still = await prisma.shipmentImport.findUnique({ where: { id: record.id }, select: { status: true } });
      if (still?.status === "PROCESSING") await refreshCounts(record.id, false);
    }
  }
  return { batches };
}

// Runs right after the confirming request ends; the sweeper and later polls finish any rest.
export function scheduleImportProcessing() {
  try {
    after(async () => {
      try {
        await advanceShipmentImports();
      } catch (error) {
        console.error("Shipment import processing failed", error instanceof Error ? error.message : error);
      }
    });
  } catch {
    // Outside a request (scripts, tests) the sweeper or the next poll continues the work.
  }
}

// Previews that were never confirmed are removed after 24 hours.
export async function expireShipmentImports(now = new Date()) {
  const result = await prisma.shipmentImport.deleteMany({
    where: { status: "PREVIEW", createdAt: { lt: new Date(now.getTime() - IMPORT_PREVIEW_TTL_MS) } },
  });
  return { expired: result.count };
}

// The rows that did not make it, in the upload's own columns plus the row number and the
// problem, so the file can be fixed and uploaded again. Spreadsheet formulas are escaped.
export async function importErrorsCsv(actor: AuthenticatedUser, id: string) {
  const user = await requireCustomer(actor);
  const record = await ownedImport(user.id, id);
  const rows = await prisma.shipmentImportRow.findMany({
    where: { importId: id, status: { in: ["INVALID", "FAILED"] } },
    orderBy: { rowNumber: "asc" },
  });
  const lines = rows.map((row) => {
    const data = row.data as Partial<Record<ImportColumn, unknown>>;
    const issues = (row.errors ?? []) as unknown as RowIssue[];
    const problem = issues.map((issue) => (issue.field ? `${issue.field}: ${issue.message}` : issue.message)).join("; ");
    return [...IMPORT_COLUMNS.map((column) => (data[column] === undefined || data[column] === null ? "" : String(data[column]))), row.rowNumber, problem];
  });
  const base = record.fileName.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "shipments";
  return {
    filename: `${base}-errors.csv`,
    contentType: "text/csv; charset=utf-8",
    // The byte order mark lets Excel read Bangla names correctly; the parser drops it again.
    content: `﻿${toCsv([[...IMPORT_COLUMNS, "row", "error"], ...lines])}`,
  };
}
