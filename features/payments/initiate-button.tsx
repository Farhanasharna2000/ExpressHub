"use client";

import { useEffect, useState, useRef } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { ApiError, errorMessage } from "@/lib/client/api";
import { useRetryDelay } from "@/features/shipments/use-resource";
import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/i18n/use-format";
import { localize } from "@/lib/i18n/bridge";
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
  const t = useTranslations("payments.pay");
  const f = useFormat();
  const { store } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useRef(false);
  const delay = useRetryDelay(error);

  // The button stays locked while the browser leaves for Stripe. If the user comes
  // back with the Back button, the page is restored from cache and must unlock.
  useEffect(() => {
    function unlockOnReturn(event: PageTransitionEvent) {
      if (!event.persisted) return;
      pending.current = false;
      setBusy(false);
    }
    window.addEventListener("pageshow", unlockOnReturn);
    return () => window.removeEventListener("pageshow", unlockOnReturn);
  }, []);

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
        localize("payments.pay.alreadyDone", "This payment has already been completed or the session has expired. Check your payment history.")
      );
    } catch (err) {
      pending.current = false;
      setBusy(false);
      setError(err);
      toast.error(
        t("startFailed"),
        errorMessage(err).replace(/\.{2,}/g, ".")
      );
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
            {t("opening")}
          </>
        ) : delay > 0 ? (
          t("tryAgainIn", { seconds: f.digits(delay) })
        ) : (
          <>
            <CreditCard className="size-4" />
            {price ? t("payAmount", { amount: f.money(String(price), currency.toUpperCase()) }) : t("pay")}
          </>
        )}
      </Button>
    </div>
  );
}
