"use client";

import { useState, useRef } from "react";
import { CreditCard, Loader2, CircleAlert, X } from "lucide-react";
import { Toast, Portal } from "radix-ui";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/provider";
import { ApiError, errorMessage } from "@/lib/client/api";
import { useRetryDelay } from "@/features/shipments/use-resource";
import {
  getIdempotencyKey,
  savePendingPayment,
  type InitiatePaymentResult,
} from "./contracts";

interface PayButtonProps {
  shipmentId: string;
  trackingNumber?: string;
  price?: string | number;
  currency?: string;
  className?: string;
  size?: "default" | "sm" | "lg";
}

export function PayWithStripeButton({
  shipmentId,
  trackingNumber,
  price,
  currency = "BDT",
  className = "",
  size = "default",
}: PayButtonProps) {
  const { store } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const pending = useRef(false);
  const delay = useRetryDelay(error);

  async function handlePay() {
    if (pending.current || busy || delay > 0) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setToastOpen(false);

    try {
      const idempotencyKey = getIdempotencyKey(shipmentId);
      const result = await store.api.request<InitiatePaymentResult>(
        "/payments/initiate",
        {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          body: {
            shipmentId,
          },
        }
      );

      if (result.payment?.id) {
        savePendingPayment({
          paymentId: result.payment.id,
          shipmentId,
          checkoutUrl: result.checkoutUrl,
        });
      }

      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      // If checkoutUrl is null, payment is already settled or closed
      throw new ApiError(
          409,
          "This payment has already been completed or the session has expired. Check your payment history."
      );
    } catch (err) {
      setError(err);
      setToastOpen(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Toast.Provider duration={8000} swipeDirection="right">
    <div className={`flex flex-col gap-3 ${className}`.trim()}>
      <Button
        variant="default"
        size={size}
        disabled={busy || delay > 0}
        onClick={handlePay}
        className="w-full sm:w-auto font-semibold gap-2 shadow-sm"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Opening secure payment page…
          </>
        ) : delay > 0 ? (
          `Try again in ${delay}s`
        ) : (
          <>
            <CreditCard className="size-4" />
            Pay with Stripe
            {price ? ` (${currency.toUpperCase()} ${price})` : ""}
          </>
        )}
      </Button>

    </div>
    <Portal.Root>
      <Toast.Root open={toastOpen} onOpenChange={setToastOpen} type="foreground"
        className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-background p-4 text-foreground shadow-lg">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Toast.Title className="text-sm font-semibold">Could not start payment</Toast.Title>
          <Toast.Description className="mt-1 break-words text-sm text-muted-foreground">
            {error ? errorMessage(error).replace(/\.{2,}/g, ".") : ""}
          </Toast.Description>
        </div>
        <Toast.Close aria-label="Dismiss payment notification" className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="size-4" aria-hidden="true" />
        </Toast.Close>
      </Toast.Root>
      <Toast.Viewport aria-label="Payment notifications" className="fixed top-4 right-4 z-[100] m-0 flex w-[calc(100vw-2rem)] max-w-sm list-none flex-col gap-3 p-0 outline-none" />
    </Portal.Root>
    </Toast.Provider>
  );
}
