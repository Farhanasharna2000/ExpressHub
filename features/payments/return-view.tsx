"use client";
import { ResourceSkeleton } from "@/components/ui/skeleton";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { StatusBadge, ErrorNotice } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { errorMessage } from "@/lib/client/api";
import {
  getPendingPayment,
  clearPendingPayment,
  money,
  dateTime,
  statusLabel,
  type Payment,
  type PaymentDetailResponse,
} from "./contracts";

interface CheckoutReturnViewProps {
  type: "success" | "cancel";
}

export function CheckoutReturnView({ type }: CheckoutReturnViewProps) {
  const { status: authStatus, store } = useSession();
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
    const sessionId = searchParams.get("session_id");
    const pending = getPendingPayment();

    if (fromQuery) {
      setPaymentId(fromQuery);
      if (pending?.paymentId === fromQuery) {
        setShipmentId(pending.shipmentId);
      }
    } else if (pending?.paymentId) {
      setPaymentId(pending.paymentId);
      setShipmentId(pending.shipmentId);
    } else if (sessionId) {
      if (authStatus === "authenticated") {
        void store.api
          .request<{ payments: Payment[] }>("/payments?limit=1")
          .then((res) => {
            const latest = res?.payments?.[0];
            if (latest) {
              setPaymentId(latest.id);
              setShipmentId(latest.shipmentId);
            } else {
              setLoading(false);
            }
          })
          .catch(err => { setLoading(false); setError(err); });
      } else if (authStatus === "anonymous" || authStatus === "error") {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [searchParams, authStatus, store]);

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
        toast.success("Payment complete", "Your payment has been successfully confirmed.");
      }

      return res.payment;
    } catch (err) {
      setError(err);
      toast.error("Could not verify status", errorMessage(err));
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
            {payment?.status === "PAID" ? (
              <CheckCircle2 className="size-8 text-green-600" />
            ) : payment?.status === "PENDING" && type === "success" ? (
              <Clock className="size-8 text-amber-600" />
            ) : (
              <AlertTriangle className="size-8 text-amber-600" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {payment?.status === "PAID"
              ? "Payment complete"
              : payment && payment.status !== "PENDING"
                ? `Payment ${statusLabel(payment.status).toLowerCase()}`
                : type === "cancel"
                  ? "Checkout closed"
                  : loading || paymentId ? "Checking your payment" : "Payment status unavailable"}
          </CardTitle>
          {payment?.status !== "PAID" && <CardDescription className="text-sm mt-1">
            {payment?.status === "FAILED"
                ? "Payment failed. Open your shipment to try again."
                : payment && payment.status !== "PENDING"
                  ? "Your latest payment status is shown below."
                  : type === "cancel"
                    ? "Check the status below before trying again."
                    : pollAttempt < maxPolls
                      ? "We’re waiting for payment confirmation. This page will update automatically."
                      : "Confirmation is taking longer than expected. Refresh to check again."}
          </CardDescription>}
        </CardHeader>

        <CardContent className="space-y-4">
          {loading && !payment && (
            <ResourceSkeleton variant="detail" label="Checking whether your payment was completed. Please wait…" />
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
                <span className="text-muted-foreground font-medium">Payment ID:</span>
                <code className="min-w-0 break-all text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {payment.id}
                </code>
              </div>
              {payment.paidAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Paid at:</span>
                  <span className="text-xs text-muted-foreground">
                    {dateTime(payment.paidAt)}
                  </span>
                </div>
              )}
            </div>
          )}

          {!loading && !paymentId && (
            <Alert className="text-xs sm:text-sm">
              <AlertTitle>Payment not found</AlertTitle>
              <AlertDescription>
                Open your payment history to find this payment.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {paymentId && (payment?.status === "PENDING" || !!error) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={loading}
              className="w-full sm:w-auto gap-2"
            >
              <RefreshCw className={loading ? "animate-spin size-3.5" : "size-3.5"} />
              {loading ? "Checking payment…" : "Refresh status"}
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

            <Link href="/customer/payments" className="text-sm font-medium text-primary hover:underline">
              Payment history
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
