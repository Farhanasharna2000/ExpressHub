"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export interface SignaturePadHandle {
  canvas: HTMLCanvasElement | null;
  clear: () => void;
}

interface SignaturePadProps {
  onChange: (hasInk: boolean) => void;
  disabled?: boolean;
  labelId: string;
}

// Pointer events cover finger, stylus and mouse. Keyboard users type the name instead.
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad({ onChange, disabled, labelId }, ref) {
  const t = useTranslations("courier");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const reset = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111827";
  }, []);

  const clear = useCallback(() => {
    reset();
    onChange(false);
  }, [onChange, reset]);

  useImperativeHandle(ref, () => ({ canvas: canvasRef.current, clear }), [clear]);
  useEffect(() => reset(), [reset]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = point(event);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const next = point(event);
    context.beginPath();
    context.moveTo(last.current.x, last.current.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    last.current = next;
    onChange(true);
  }

  function end() {
    drawing.current = false;
    last.current = null;
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        role="img"
        aria-labelledby={labelId}
        className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      <Button type="button" variant="outline" size="sm" onClick={clear} disabled={disabled} className="min-h-11">
        <Eraser className="size-4" aria-hidden="true" /> {t("clearSignature")}
      </Button>
    </div>
  );
});
