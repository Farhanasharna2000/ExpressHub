"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useFormat } from "@/lib/i18n/use-format";
import {
  IMPORT_COLUMNS, IMPORT_MAX_ROWS, REQUIRED_IMPORT_COLUMNS,
  type ImportDetail, type ImportProblem, type ImportWarning, type RowIssue,
} from "@/lib/shipment-import";
import { localizedParams } from "./contracts";

export function UploadPanel({ busy, fileName, onFile, onTemplate }: { busy: boolean; fileName: string; onFile: (file: File) => void; onTemplate: () => void }) {
  const t = useTranslations("shipmentImport");
  const f = useFormat();
  const [dragging, setDragging] = useState(false);

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) onFile(file);
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <label
          onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 motion-reduce:transition-none",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60",
            busy && "cursor-progress opacity-70",
          )}
        >
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={busy}
            aria-label={t("drop.label")}
            aria-describedby="shipment-import-drop-hint"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onFile(file);
            }}
          />
          {busy ? <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" /> : <FileSpreadsheet className="size-8 text-primary" aria-hidden="true" />}
          <span className="font-semibold text-ink">{busy ? t("drop.uploading", { name: fileName }) : t("drop.title")}</span>
          {!busy && (
            <>
              <span className="text-sm text-muted-foreground">{t("drop.or")}</span>
              <span className="inline-flex min-h-9 items-center rounded-md border bg-background px-4 text-sm font-medium">{t("drop.choose")}</span>
            </>
          )}
          <span id="shipment-import-drop-hint" className="text-xs text-muted-foreground">{t("drop.hint", { rows: f.number(IMPORT_MAX_ROWS) })}</span>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={onTemplate}>
            <Download aria-hidden="true" /> {t("templateButton")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function GuidePanel() {
  const t = useTranslations("shipmentImport");
  const f = useFormat();
  return (
    <Card>
      <CardContent>
        <details className="group">
          <summary className="cursor-pointer rounded-md font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{t("guideTitle")}</summary>
          <p className="mt-3 text-sm text-muted-foreground">{t("guideIntro", { rows: f.number(IMPORT_MAX_ROWS) })}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t("guideTitle")}</caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pe-3 font-medium">{t("guideColumns.column")}</th>
                  <th scope="col" className="py-2 pe-3 font-medium">{t("guideColumns.required")}</th>
                  <th scope="col" className="py-2 font-medium">{t("guideColumns.format")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {IMPORT_COLUMNS.map((column) => (
                  <tr key={column}>
                    <th scope="row" className="py-2 pe-3 align-top font-normal">
                      <code className="break-all text-xs font-semibold">{column}</code>
                      <span className="block text-xs text-muted-foreground">{t(`columns.${column}`)}</span>
                    </th>
                    <td className="py-2 pe-3 align-top">{REQUIRED_IMPORT_COLUMNS.includes(column) ? t("guideColumns.yes") : t("guideColumns.no")}</td>
                    <td className="py-2 align-top text-muted-foreground">{t(`hints.${column}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function useIssueText() {
  const t = useTranslations("shipmentImport");
  const f = useFormat();
  return {
    issue: (issue: RowIssue) => {
      const key = `rowIssues.${issue.code}`;
      if (issue.code !== "invalid" && t.has(key as Parameters<typeof t>[0])) return t(key as Parameters<typeof t>[0], localizedParams(issue.params, f.number));
      return issue.message;
    },
    column: (field: string | null) => (field && t.has(`columns.${field}` as Parameters<typeof t>[0]) ? t(`columns.${field}` as Parameters<typeof t>[0]) : t("preview.wholeRow")),
  };
}

export function ProblemsTable({ problems, total, title }: { problems: ImportProblem[]; total: number; title: string }) {
  const t = useTranslations("shipmentImport");
  const f = useFormat();
  const text = useIssueText();
  const lines = problems.flatMap((problem) => (problem.issues.length ? problem.issues : [null]).map((issue, index) => ({ problem, issue, index })));
  return (
    <section aria-labelledby="shipment-import-problems">
      <h2 id="shipment-import-problems" className="mb-1 flex items-center gap-2 text-base font-semibold">
        <TriangleAlert className="size-4 text-amber-600" aria-hidden="true" /> {title}
      </h2>
      <p className="mb-2 text-sm text-muted-foreground">{t("preview.problemsHint")}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{t("preview.rowHeader")}</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{t("preview.columnHeader")}</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{t("preview.problemHeader")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map(({ problem, issue, index }) => (
              <tr key={`${problem.row}-${index}`}>
                <td className="whitespace-nowrap px-3 py-2 align-top font-medium">{index === 0 ? f.number(problem.row) : ""}</td>
                <td className="px-3 py-2 align-top">{issue ? text.column(issue.field) : text.column(null)}</td>
                <td className="px-3 py-2 align-top text-destructive">{issue ? text.issue(issue) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > problems.length && <p className="mt-2 text-xs text-muted-foreground">{t("preview.problemsLimit", { shown: f.number(problems.length), total: f.number(total) })}</p>}
    </section>
  );
}

function Warnings({ warnings }: { warnings: ImportWarning[] }) {
  const t = useTranslations("shipmentImport");
  const f = useFormat();
  if (warnings.length === 0) return null;
  return (
    <section aria-labelledby="shipment-import-warnings" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <h2 id="shipment-import-warnings" className="mb-1 font-semibold">{t("preview.warningsTitle")}</h2>
      <ul className="list-disc space-y-0.5 ps-5">
        {warnings.map((warning) => (
          <li key={warning.code === "duplicate_row" ? `d${warning.row}` : "c"}>
            {warning.code === "duplicate_row"
              ? t("preview.duplicate", { row: f.number(warning.row), of: f.number(warning.of) })
              : t("preview.ignored", { columns: warning.columns.join(", ") })}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div className="flex-col rounded-lg border bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-2xl font-bold", tone === "bad" && "text-destructive", tone === "good" && "text-primary")}>{value}</dd>
    </div>
  );
}

export function PreviewPanel({ detail, busy, onConfirm, onReset, onDownload }: { detail: ImportDetail; busy: boolean; onConfirm: () => void; onReset: () => void; onDownload: () => void }) {
  const t = useTranslations("shipmentImport");
  const f = useFormat();
  const summary = detail.import;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold tracking-normal">{t("preview.title")}</h2>
          <CardDescription className="break-all">{t("preview.file", { name: summary.fileName })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-4">
            <Stat label={t("preview.total")} value={f.number(summary.totalRows)} />
            <Stat label={t("preview.ready")} value={f.number(summary.validRows)} tone="good" />
            <Stat label={t("preview.problems")} value={f.number(summary.invalidRows)} tone={summary.invalidRows > 0 ? "bad" : undefined} />
            <div className="flex-col rounded-lg border bg-card px-4 py-3">
              <dt className="text-xs text-muted-foreground">{t("preview.estimated")}</dt>
              <dd className="space-y-0.5 text-lg font-bold">
                {summary.estimatedTotals.length ? summary.estimatedTotals.map((total) => <div key={total.currency}>{f.money(total.amount, total.currency)}</div>) : "–"}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">{t("preview.estimatedNote")}</p>
          <Warnings warnings={summary.warnings} />
          {detail.problemsTotal > 0 && <ProblemsTable problems={detail.problems} total={detail.problemsTotal} title={t("preview.problemsTitle")} />}
          {detail.sample.length > 0 && (
            <section aria-labelledby="shipment-import-sample">
              <h2 id="shipment-import-sample" className="mb-2 flex items-center gap-2 text-base font-semibold">
                <CheckCircle2 className="size-4 text-primary" aria-hidden="true" /> {t("preview.sampleTitle")}
              </h2>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[38rem] text-left text-sm">
                  <caption className="sr-only">{t("preview.sampleCaption", { count: f.number(detail.sample.length) })}</caption>
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{t("preview.rowHeader")}</th>
                      <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{t("preview.recipient")}</th>
                      <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{t("preview.address")}</th>
                      <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{t("preview.weight")}</th>
                      <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{t("preview.price")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detail.sample.map((row) => (
                      <tr key={row.row}>
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{f.number(row.row)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{row.deliveryContactName}</td>
                        <td className="px-3 py-2 break-words">{row.deliveryAddress}</td>
                        <td className="whitespace-nowrap px-3 py-2">{f.number(row.parcelWeightKg, { maximumFractionDigits: 3 })}</td>
                        <td className="whitespace-nowrap px-3 py-2">{row.estimatedPrice && row.currency ? f.money(row.estimatedPrice, row.currency) : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {summary.validRows > detail.sample.length && <p className="mt-2 text-xs text-muted-foreground">{t("preview.problemsLimit", { shown: f.number(detail.sample.length), total: f.number(summary.validRows) })}</p>}
            </section>
          )}
          {summary.validRows === 0 && <p role="alert" className="text-sm text-destructive">{t("preview.noValid")}</p>}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onConfirm} disabled={busy || summary.validRows === 0} className="min-h-11">
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? t("preview.confirming") : t("preview.confirm", { count: summary.validRows })}
        </Button>
        <Button type="button" variant="outline" onClick={onReset} disabled={busy} className="min-h-11">{t("preview.another")}</Button>
        {detail.problemsTotal > 0 && (
          <Button type="button" variant="ghost" onClick={onDownload} disabled={busy} className="min-h-11">
            <Download aria-hidden="true" /> {t("preview.download")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ProgressPanel({ detail }: { detail: ImportDetail }) {
  const t = useTranslations("shipmentImport");
  const f = useFormat();
  const { validRows, createdCount, failedCount } = detail.import;
  const done = createdCount + failedCount;
  const percent = validRows === 0 ? 0 : Math.min(100, Math.round((done / validRows) * 100));
  const status = t("progress.status", { done: f.number(done), total: f.number(validRows) });
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold tracking-normal">{t("progress.title")}</h2>
        <CardDescription>{t("progress.keepOpen")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3" aria-busy="true">
        <div
          role="progressbar"
          aria-label={t("progress.label")}
          aria-valuemin={0}
          aria-valuemax={validRows}
          aria-valuenow={done}
          aria-valuetext={status}
          className="h-3 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
        </div>
        <p aria-live="polite" className="text-sm font-medium">{status}</p>
        <p className="text-sm text-muted-foreground">
          {t("progress.created", { count: f.number(createdCount) })}
          {failedCount > 0 && ` · ${t("progress.failed", { count: f.number(failedCount) })}`}
        </p>
      </CardContent>
    </Card>
  );
}

export function ResultPanel({ detail, onReset, onDownload }: { detail: ImportDetail; onReset: () => void; onDownload: () => void }) {
  const t = useTranslations("shipmentImport");
  const f = useFormat();
  const { createdCount, validRows, failedCount } = detail.import;
  const allCreated = failedCount === 0 && detail.problemsTotal === 0;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-normal">
            <CheckCircle2 className="size-5 text-primary" aria-hidden="true" /> {t("result.doneTitle")}
          </h2>
          <CardDescription role="status">{t("result.summary", { created: f.number(createdCount), total: f.number(validRows) })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{allCreated ? t("result.allDone") : t("result.someFailed")}</p>
          {createdCount > 0 && <p className="text-sm text-muted-foreground">{t("result.payNote")}</p>}
          {detail.createdShipments.length > 0 && (
            <section aria-labelledby="shipment-import-created">
              <h2 id="shipment-import-created" className="mb-2 text-base font-semibold">{t("result.shipmentsTitle")}</h2>
              <ul className="grid gap-1 sm:grid-cols-2">
                {detail.createdShipments.map((shipment) => (
                  <li key={shipment.id}>
                    <Link href={`/customer/shipments/${encodeURIComponent(shipment.id)}`} className="break-all font-mono text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      {shipment.trackingNumber}
                    </Link>
                  </li>
                ))}
              </ul>
              {createdCount > detail.createdShipments.length && (
                <p className="mt-2 text-xs text-muted-foreground">{t("result.shipmentsMore", { shown: f.number(detail.createdShipments.length), total: f.number(createdCount) })}</p>
              )}
            </section>
          )}
          {detail.problemsTotal > 0 && <ProblemsTable problems={detail.problems} total={detail.problemsTotal} title={t("result.problemsTitle")} />}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild className="min-h-11">
          <Link href="/customer/shipments">{t("result.viewAll")}</Link>
        </Button>
        {detail.problemsTotal > 0 && (
          <Button type="button" variant="outline" onClick={onDownload} className="min-h-11">
            <Download aria-hidden="true" /> {t("preview.download")}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onReset} className="min-h-11">{t("result.anotherImport")}</Button>
      </div>
    </div>
  );
}
