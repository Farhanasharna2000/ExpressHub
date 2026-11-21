"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { IMPORT_MAX_BYTES, templateCsv, type ImportDetail } from "@/lib/shipment-import";
import { useFormat } from "@/lib/i18n/use-format";
import { importErrorText, saveTextFile } from "./contracts";
import { GuidePanel, PreviewPanel, ProgressPanel, ResultPanel, UploadPanel } from "./import-panels";

const POLL_MS = 2000;

function rememberImport(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("import", id);
  else url.searchParams.delete("import");
  window.history.replaceState(null, "", url);
}

export function ShipmentImportPage() {
  const t = useTranslations("shipmentImport");
  const f = useFormat();
  const { store } = useSession();
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const [resuming, setResuming] = useState(false);
  const [busy, setBusy] = useState<"upload" | "confirm" | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const importId = detail?.import.id ?? null;
  const status = detail?.import.status ?? null;

  const describe = useCallback((cause: unknown) => importErrorText(cause, t as never, f.number), [t, f]);

  // A reload or a shared link continues the import in the address bar.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("import");
    if (!id) return;
    let cancelled = false;
    setResuming(true);
    store.api
      .request<ImportDetail>(`/shipments/imports/${encodeURIComponent(id)}`)
      .then((next) => { if (!cancelled) setDetail(next); })
      .catch((cause) => {
        if (cancelled) return;
        rememberImport(null);
        setError(describe(cause));
      })
      .finally(() => { if (!cancelled) setResuming(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // While rows are being created, ask for progress; stop as soon as the import ends.
  useEffect(() => {
    if (!importId || status !== "PROCESSING") return;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      try {
        const next = await store.api.request<ImportDetail>(`/shipments/imports/${encodeURIComponent(importId)}`);
        if (!stopped) setDetail(next);
      } catch {
        // A missed poll is not a failure; the next one catches up.
      }
      if (!stopped) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [importId, status, store]);

  async function upload(file: File) {
    if (pending.current) return;
    setError(null);
    if (file.size > IMPORT_MAX_BYTES) return setError(t("errors.tooLarge"));
    if (!/\.csv$/i.test(file.name) && !/csv/i.test(file.type)) return setError(t("errors.notCsv"));
    pending.current = true;
    setBusy("upload");
    setFileName(file.name);
    try {
      const form = new FormData();
      form.set("file", file);
      const next = await store.api.request<ImportDetail>("/shipments/imports", { method: "POST", body: form });
      setDetail(next);
      rememberImport(next.import.id);
    } catch (cause) {
      setError(describe(cause));
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  async function confirm() {
    if (!importId || pending.current) return;
    setError(null);
    pending.current = true;
    setBusy("confirm");
    try {
      setDetail(await store.api.request<ImportDetail>(`/shipments/imports/${encodeURIComponent(importId)}/confirm`, { method: "POST" }));
    } catch (cause) {
      setError(describe(cause));
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  async function downloadProblems() {
    if (!importId) return;
    try {
      const result = await store.api.request<{ export: { filename: string; contentType: string; content: string } }>(`/shipments/imports/${encodeURIComponent(importId)}/errors`);
      saveTextFile(result.export.content, result.export.filename, result.export.contentType);
    } catch (cause) {
      toast.error(t("preview.download"), describe(cause));
    }
  }

  function reset() {
    setDetail(null);
    setError(null);
    rememberImport(null);
  }

  return (
    <div className="page-stack">
      <Link href="/customer/shipments" className="back-link"><ArrowLeft className="inline size-4 rtl:rotate-180" aria-hidden="true" /> {t("back")}</Link>
      <div className="page-heading">
        <div>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {resuming && !detail && <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>}

      {!detail && !resuming && (
        <>
          <UploadPanel busy={busy === "upload"} fileName={fileName} onFile={(file) => void upload(file)} onTemplate={() => saveTextFile(`﻿${templateCsv()}`, "expresshub-shipments-template.csv", "text/csv;charset=utf-8")} />
          <GuidePanel />
        </>
      )}

      {detail && status === "PREVIEW" && (
        <PreviewPanel detail={detail} busy={busy === "confirm"} onConfirm={() => void confirm()} onReset={reset} onDownload={() => void downloadProblems()} />
      )}
      {detail && status === "PROCESSING" && <ProgressPanel detail={detail} />}
      {detail && (status === "DONE" || status === "FAILED") && <ResultPanel detail={detail} onReset={reset} onDownload={() => void downloadProblems()} />}
    </div>
  );
}
