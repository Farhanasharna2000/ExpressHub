"use client";

import type { ReactNode } from "react";
import { Dialog as DialogRoot, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./dialog";
import type { PaginationMeta } from "@/types/api";
import { Button } from "./primitives";

export function Pagination({ meta, onPageChange, busy = false }: { meta: PaginationMeta; onPageChange: (page: number) => void; busy?: boolean }) {
  return <nav className="pagination" aria-label="Pagination"><Button variant="secondary" disabled={busy || meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>Previous</Button><span aria-live="polite">{meta.total === 0 ? "No results" : `Page ${meta.page} of ${meta.totalPages} · ${meta.total} results`}</span><Button variant="secondary" disabled={busy || meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>Next</Button></nav>;
}

/** Accessible shadcn/Radix modal; callers own open state. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return <DialogRoot open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Review the details before continuing.</DialogDescription></DialogHeader>{children}</DialogContent></DialogRoot>;
}
