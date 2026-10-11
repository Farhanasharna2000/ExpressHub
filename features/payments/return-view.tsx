"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Package,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { StatusBadge, LoadingState, ErrorNotice } from "@/components/ui/primitives";
import { useSession } from "@/features/auth/provider";
import { errorMessage } from "@/lib/client/api";
import {
  getPendingPayment,
  clearPendingPayment,
  money,
  dateTime,
  type Payment,
  type PaymentDetailResponse,
} from "./contracts";

interface CheckoutReturnViewProps {
  type: "success" | "cancel";
}

export function CheckoutReturnView({ type }: CheckoutReturnViewProps) {
  const { user, status: authStatus, store } = useSession();
  const searchParams = useSearchParams();

  // Identify payment ID from query params or session recovery storage
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [pollAttempt, setPollAttempt] = useState(0);
  const maxPolls = 6;
  const pollTimerRef = useRef<number | null>(null);

  // Initialize payment identification
  useEffect(() => {
    const fromQuery = searchParams.get("paymentId");
    const pending = getPendingPayment();

    if (fromQuery) {
      setPaymentId(fromQuery);
      if (pending?.paymentId === fromQuery) {
        setShipmentId(pending.shipmentId);
      }
    } else if (pending?.paymentId) {
      setPaymentId(pending.paymentId);
      setShipmentId(pending.shipmentId);
    } else {
      setLoading(false);
    }
  }, [searchParams]);

  // Fetch and poll payment verification
  async function fetchStatus(id: string) {
    try {
      setError(null);
      const res = await store.api.request<PaymentDetailResponse>(
        `/payments/${encodeURIComponent(id)}`
      );
      setPayment(res.payment);

      if (res.payment.status === "PAID") {
        clearPendingPayment();
      }

      return res.payment;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }

  // Effect to load initial payment status once session is ready
  useEffect(() => {
    if (!paymentId || authStatus === "loading") return;

    void fetchStatus(paymentId);
  }, [paymentId, authStatus]);

  // Bounded polling for success returns when payment is still PENDING
  useEffect(() => {
    if (
      type === "success" &&
      payment?.status === "PENDING" &&
      pollAttempt < maxPolls &&
      paymentId
    ) {
      const delays = [1500, 2500, 4000, 6000, 8000, 10000];
      const nextDelay = delays[pollAttempt] ?? 10000;

      pollTimerRef.current = window.setTimeout(async () => {
        setPollAttempt((prev) => prev + 1);
        await fetchStatus(paymentId);
      }, nextDelay);
    }

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [type, payment?.status, pollAttempt, paymentId]);

  function handleManualRefresh() {
    if (!paymentId) return;
    setLoading(true);
    setPollAttempt(0);
    void fetchStatus(paymentId);
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4 sm:px-6">
      <Card className="shadow-md border-border/80">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-muted">
            {type === "success" ? (
              payment?.status === "PAID" ? (
                <CheckCircle2 className="size-8 text-green-600" />
              ) : (
                <Clock className="size-8 text-amber-600 animate-pulse" />
              )
            ) : (
              <AlertTriangle className="size-8 text-amber-600" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {type === "success"
              ? payment?.status === "PAID"
                ? "Payment Verified & Complete"
                : "Checking Payment Verification…"
              : "You Left Stripe Checkout"}
          </CardTitle>
          <CardDescription className="text-sm mt-1">
            {type === "success"
              ? payment?.status === "PAID"
                ? "Your payment was confirmed by Stripe webhooks and recorded on your shipment."
                : "Returning from Checkout does not immediately confirm payment. Verification is processing."
              : "Checkout was cancelled in the browser. A cancelled return does not automatically alter settled payments."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading && !payment && (
            <LoadingState label="Verifying payment status with the service…" />
          )}

          {!!error && (
            <ErrorNotice title="Could not verify status">
              {errorMessage(error)}
            </ErrorNotice>
          )}

          {payment && (
            <div className="rounded-xl bg-muted/40 p-4 border space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Status:</span>
                <StatusBadge status={payment.status} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Amount:</span>
                <span className="font-bold text-base">
                  {money(payment.amount, payment.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Transaction ID:</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {payment.id}
                </code>
              </div>
              {payment.paidAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Settled at:</span>
                  <span className="text-xs text-muted-foreground">
                    {dateTime(payment.paidAt)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Contextual guidance */}
          {type === "success" && payment?.status === "PENDING" && (
            <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 text-xs sm:text-sm">
              <Clock className="size-4 text-amber-600" />
              <AlertTitle className="font-semibold">Verification in Progress</AlertTitle>
              <AlertDescription>
                {pollAttempt < maxPolls
                  ? `Checking for webhook confirmation (attempt ${pollAttempt + 1} of ${maxPolls})…`
                  : "Stripe webhook confirmation is taking longer than expected. You can check back shortly or refresh."}
              </AlertDescription>
            </Alert>
          )}

          {type === "cancel" && payment?.status === "PENDING" && (
            <Alert className="border-muted bg-muted/60 text-xs sm:text-sm">
              <AlertTitle className="font-semibold">Checkout Session Incomplete</AlertTitle>
              <AlertDescription>
                Your shipment remains in Created status and will not be dispatched until payment is verified. You can restart Checkout whenever you are ready.
              </AlertDescription>
            </Alert>
          )}

          {!paymentId && (
            <Alert className="text-xs sm:text-sm">
              <AlertTitle>No Recent Checkout Reference Found</AlertTitle>
              <AlertDescription>
                Your session has ended. To inspect your payment records, open your payments history.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {payment?.status === "PENDING" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={loading}
              className="w-full sm:w-auto gap-2"
            >
              <RefreshCw className={loading ? "animate-spin size-3.5" : "size-3.5"} />
              Refresh status
            </Button>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto ml-auto">
            {(payment?.shipmentId || shipmentId) && (
              <Button asChild variant="default" size="sm" className="w-full sm:w-auto">
                <Link href={`/customer/shipments/${payment?.shipmentId || shipmentId}`}>
                  <Package className="size-4 mr-1.5" />
                  View Shipment
                </Link>
              </Button>
            )}

            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link href="/customer/payments">
                <CreditCard className="size-4 mr-1.5" />
                All Payments
              </Link>
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
