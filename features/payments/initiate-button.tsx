"use client";

import { useState, useRef } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
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
  trackingNumber: _trackingNumber,
  price,
  currency = "BDT",
  className = "",
  size = "default",
}: PayButtonProps) {
  const { store } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useRef(false);
  const delay = useRetryDelay(error);

  async function handlePay() {
    if (pending.current || busy || delay > 0) return;
    pending.current = true;
    setBusy(true);
    setError(null);

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
      toast.error(
        "Could not start payment",
        errorMessage(err).replace(/\.{2,}/g, ".")
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
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
  );
}
