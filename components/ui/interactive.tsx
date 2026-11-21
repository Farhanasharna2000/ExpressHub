"use client";
import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/i18n/use-format";

import { useId, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import { NativeSelect } from "./native-select";
import { Dialog as DialogRoot, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./dialog";
import type { PaginationMeta } from "@/types/api";
import { Button } from "./button";

export interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  busy?: boolean;
}

export function Pagination({
  meta,
  onPageChange,
  onPageSizeChange,
  busy = false,
}: PaginationProps) {
  const selectId = useId();
  const t = useTranslations("common.pagination");
  const f = useFormat();
  const totalPages = Math.max(1, meta.totalPages);
  const currentPage = Math.min(Math.max(1, meta.page), totalPages);
  const visible = new Set([1, totalPages]);
  const start = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
  for (let page = start; page <= Math.min(totalPages, start + 2); page++) visible.add(page);
  const pages: (number | string)[] = [];
  for (const page of [...visible].sort((a, b) => a - b)) {
    const previous = pages.at(-1);
    if (typeof previous === "number" && page - previous === 2) pages.push(previous + 1);
    else if (typeof previous === "number" && page - previous > 2) pages.push(`gap-${page}`);
    pages.push(page);
  }
  const sizes = [...new Set([5, 10, 20, 25, 50, 100, meta.limit])].sort((a, b) => a - b);

  return (
    <div className="mt-6 flex flex-col items-center justify-between gap-4 border-t pt-4 sm:flex-row">
      {onPageSizeChange && (
        <div className="flex shrink-0 items-center gap-3">
          <label htmlFor={selectId} className="text-sm font-medium">{t("rowsPerPage")}</label>
          <NativeSelect id={selectId} value={meta.limit} disabled={busy} onChange={event => onPageSizeChange(Number(event.target.value))} className="w-20 rounded-lg">
            {sizes.map(size => <option key={size} value={size}>{f.digits(size)}</option>)}
          </NativeSelect>
        </div>
      )}
      <nav className="flex flex-wrap items-center justify-center gap-1" aria-label={t("label")}>
        <Button type="button" variant="ghost" size="sm" disabled={busy || meta.page <= 1 || meta.total === 0} onClick={() => onPageChange(Math.max(1, meta.page - 1))}>
          <ChevronLeft className="size-4" aria-hidden="true" />{t("previous")}
        </Button>
        {pages.map(page => typeof page === "number" ? (
          <Button key={page} type="button" variant={page === currentPage ? "outline" : "ghost"} size="icon-sm"
            className={page === currentPage ? "rounded-lg bg-muted font-semibold" : "rounded-lg"}
            aria-label={t("goToPage", { page })} aria-current={page === currentPage ? "page" : undefined}
            disabled={busy || meta.total === 0} onClick={() => { if (page !== meta.page) onPageChange(page); }}>
            {f.digits(page)}
          </Button>
        ) : <span key={page} className="flex size-8 items-center justify-center" aria-hidden="true"><Ellipsis className="size-4" /></span>)}
        <Button type="button" variant="ghost" size="sm" disabled={busy || meta.page >= totalPages || meta.total === 0} onClick={() => onPageChange(meta.page + 1)}>
          {t("next")}<ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </nav>
      <span className="sr-only" aria-live="polite">{meta.total === 0 ? t("noResults") : t("status", { page: meta.page, pages: totalPages, total: meta.total })}</span>
    </div>
  );
}

/** Accessible shadcn/Radix modal; callers own open state. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const t = useTranslations("common");
  return <DialogRoot open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{t("reviewDetails")}</DialogDescription></DialogHeader>{children}</DialogContent></DialogRoot>;
}
