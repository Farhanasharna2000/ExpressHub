import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} aria-hidden="true" className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} />;
}

export function ResourceSkeleton({ variant = "list", label = "Loading…" }: {
  variant?: "list" | "detail" | "dashboard";
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-skeleton={variant} className="w-full space-y-4">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-4">
        {variant === "dashboard" && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-4 rounded-xl border bg-card p-6"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-9 w-20" /><Skeleton className="h-3 w-3/4" /></div>)}
        </div>}
        {variant === "detail" ? <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => <div key={index} className="space-y-6 rounded-xl border bg-card p-6"><Skeleton className="h-6 w-1/2" />{Array.from({ length: 4 }, (_, row) => <div key={row} className="space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-5 w-3/4" /></div>)}</div>)}
        </div> : <div className="overflow-hidden rounded-xl border bg-card p-4 sm:p-6">
          <Skeleton className="mb-6 h-6 w-40" />
          {Array.from({ length: 5 }, (_, row) => <div key={row} className="grid grid-cols-2 gap-4 border-t py-5 sm:grid-cols-4"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-full" /><Skeleton className="hidden h-5 w-2/3 sm:block" /><Skeleton className="hidden h-5 w-3/4 sm:block" /></div>)}
        </div>}
      </div>
    </div>
  );
}

export function ResourceRefresh() {
  return <p role="status" aria-live="polite" className="text-xs text-muted-foreground">Updating…</p>;
}
