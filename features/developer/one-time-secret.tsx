"use client";

import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

// Shows a key or signing secret that the server returns only once.
export function OneTimeSecret({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`, "Store it somewhere safe, such as your server's environment variables.");
    } catch {
      toast.error("Could not copy", "Select the text and copy it manually.");
    }
  }

  return (
    <div role="status" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4" aria-hidden="true" /> Copy your {label.toLowerCase()} now
      </p>
      <p>It will not be shown again. If you lose it, create a new one.</p>
      <code data-testid="one-time-secret" className="block overflow-x-auto rounded-md bg-white px-3 py-2 font-mono text-xs break-all text-ink">
        {value}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void copy()}>
          <Copy aria-hidden="true" /> Copy {label.toLowerCase()}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>I have saved it</Button>
      </div>
    </div>
  );
}
