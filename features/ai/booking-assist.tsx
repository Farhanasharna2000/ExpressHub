"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/features/auth/provider";
import { toLocalInput } from "@/features/shipments/contracts";
import { useResource } from "@/features/shipments/use-resource";
import { aiErrorMessage } from "./ai-error";
import { BOOKING_EXAMPLE, BOOKING_FIELD_LABELS, draftToFormValues, type BookingDraftResponse } from "./contracts";

const MAX_TEXT = 1500;


export function BookingAssist({ onApply, onBusyChange, disabled }: {
  onApply: (values: Record<string, string>, missing: string[]) => void;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
}) {
  const { store } = useSession();
  const { data } = useResource<{ bookingDraft?: boolean }>("/ai/status");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingDraftResponse | null>(null);

  if (!data?.bookingDraft) return null;

  async function fill() {
    const description = text.trim();
    if (description.length < 10 || busy) return;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setResult(null);
    try {
      const response = await store.api.request<BookingDraftResponse>("/ai/booking-draft", { method: "POST", body: { text: description } });
      setResult(response);
      onApply(draftToFormValues(response.draft, toLocalInput), response.missing);
    } catch (cause) {
      setError(aiErrorMessage(cause));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" aria-hidden="true" /> Fill the form from a description
        </CardTitle>
        <CardDescription>
          Describe the parcel in your own words, in English or Bangla, and we will fill in what we can. This replaces anything already in the form, and you check everything before booking. Your description is sent to our AI provider to read it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label htmlFor="booking-description" className="sr-only">Describe your parcel</label>
        <textarea
          id="booking-description"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX_TEXT}
          rows={3}
          placeholder={`e.g. ${BOOKING_EXAMPLE}`}
          disabled={busy || disabled}
          className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void fill()} disabled={busy || disabled || text.trim().length < 10}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            {busy ? "Reading your description…" : "Fill the form"}
          </Button>
          {!text && (
            <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setText(BOOKING_EXAMPLE)} disabled={busy || disabled}>
              Use an example
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{text.length}/{MAX_TEXT}</span>
        </div>

        <div aria-live="polite">
          {error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}
          {result && (
            <div className="space-y-1.5 rounded-lg border border-primary/20 bg-background p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                {result.filled.length
                  ? `Filled ${result.filled.length} ${result.filled.length === 1 ? "field" : "fields"}. Please check each step before creating the shipment.`
                  : "We couldn't find booking details in that description."}
              </p>
              {result.missing.length > 0 && (
                <p className="text-muted-foreground">
                  Still needed: {result.missing.map((field) => BOOKING_FIELD_LABELS[field] ?? field).join(", ")}.
                </p>
              )}
              {result.note && <p className="text-muted-foreground">{result.note}</p>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
