"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const presets = [0.5, 1, 2, 3, 5, 10];
const minimum = 0.001;
const maximum = 9999999.999;

export function WeightInput({ value, onChange, error, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const numeric = Number(value);
  function adjust(direction: number) {
    const current = Number.isFinite(numeric) ? numeric : 0;
    const next = Math.min(maximum, Math.max(minimum, current + direction * 0.5));
    onChange(String(Math.round(next * 1000) / 1000));
  }

  return (
    <div className="space-y-2">
      <label htmlFor="parcelWeightKg" className="text-sm font-semibold">Weight (kg)</label>
      <div className="flex flex-wrap items-center gap-4">
        <div className={`flex h-12 w-48 shrink-0 items-center rounded-xl border bg-background px-1 shadow-xs focus-within:ring-2 ${error ? "border-destructive focus-within:ring-destructive/20" : "border-input focus-within:border-emerald-500 focus-within:ring-emerald-500/15"} ${disabled ? "opacity-50" : ""}`}>
          <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-lg text-muted-foreground" aria-label="Decrease weight by 0.5 kg" disabled={disabled || !value || numeric <= minimum} onClick={() => adjust(-1)}>
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <input id="parcelWeightKg" name="parcelWeightKg" type="number" inputMode="decimal" required min={minimum} max={maximum} step="0.001"
            value={value} onChange={event => onChange(event.target.value)} disabled={disabled}
            aria-invalid={Boolean(error)} aria-describedby={error ? "parcelWeightKg-error" : undefined}
            className="w-0 min-w-0 flex-1 appearance-none border-0 bg-transparent py-2 text-right text-base font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          <span className="ml-1 mr-2 text-sm text-muted-foreground" aria-hidden="true">kg</span>
          <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-lg text-muted-foreground" aria-label="Increase weight by 0.5 kg" disabled={disabled || numeric >= maximum} onClick={() => adjust(1)}>
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick weight choices">
          {presets.map(weight => (
            <Button key={weight} type="button" variant="outline" size="sm" disabled={disabled}
              aria-pressed={value !== "" && numeric === weight} onClick={() => onChange(String(weight))}
              className={`rounded-full px-3 text-xs shadow-none ${value !== "" && numeric === weight ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground"}`}>
              {weight} kg
            </Button>
          ))}
        </div>
      </div>
      {error && <p id="parcelWeightKg-error" role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
