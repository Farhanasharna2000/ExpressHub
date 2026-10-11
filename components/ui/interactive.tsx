"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import type { PaginationMeta } from "@/types/api";
import { Button } from "./primitives";

export function Pagination({ meta, onPageChange, busy = false }: { meta: PaginationMeta; onPageChange: (page: number) => void; busy?: boolean }) {
  return <nav className="pagination" aria-label="Pagination"><Button variant="secondary" disabled={busy || meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>Previous</Button><span aria-live="polite">{meta.total === 0 ? "No results" : `Page ${meta.page} of ${meta.totalPages} · ${meta.total} results`}</span><Button variant="secondary" disabled={busy || meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>Next</Button></nav>;
}

/** Native modal supplies focus trapping, Escape handling, and focus restoration. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={onClose} onClose={onClose}><div className="dialog-heading"><h2 id={titleId}>{title}</h2><Button variant="secondary" onClick={onClose} aria-label="Close dialog" autoFocus>Close</Button></div>{children}</dialog>;
}
