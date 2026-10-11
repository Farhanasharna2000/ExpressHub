"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { z } from "zod";
import {
  CreditCard,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  StatusBadge,
  LoadingState,
  ErrorNotice,
  EmptyState,
} from "@/components/ui/primitives";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";
import { errorMessage } from "@/lib/client/api";
import {
  dateTime,
  money,
  statusLabel,
  type PaymentDetailResponse,
} from "./contracts";

export function PaymentDetailsView({ id }: { id: string }) {
  const isValidId = z.string().cuid().safeParse(id).success;
  const { data, loading, error, reload } = useResource<PaymentDetailResponse>(
    isValidId ? `/payments/${encodeURIComponent(id)}` : null
  );
  const delay = useRetryDelay(error);
  const payment = data?.payment;

  // Bounded live polling if status is PENDING
  const [pollingCount, setPollingCount] = useState(0);
  const maxPolls = 8;
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (payment?.status === "PENDING" && pollingCount < maxPolls) {
      const backoffMs = Math.min(10000, 2000 * Math.pow(1.5, pollingCount));
      pollTimerRef.current = window.setTimeout(() => {
        setPollingCount((prev) => prev + 1);
        reload();
      }, backoffMs);
    }
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [payment?.status, pollingCount, reload]);

  return (
    <div className="page-stack">
      <Link href="/customer/payments" className="back-link inline-flex items-center gap-1.5 text-sm font-medium hover:underline text-muted-foreground">
        <ArrowLeft className="size-4" /> My payments
      </Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Transaction verification</p>
          <h1>Payment details</h1>
          <p className="break-all font-mono text-xs sm:text-sm text-muted-foreground">
            {payment?.id ?? "Retrieving payment information…"}
          </p>
        </div>
        {isValidId && (
          <Button
            variant="outline"
            disabled={loading || delay > 0}
            onClick={() => {
              setPollingCount(0);
              reload();
            }}
            className="gap-2"
          >
            <RefreshCw className={loading ? "animate-spin size-4" : "size-4"} />
            Refresh
          </Button>
        )}
      </div>

      {!isValidId && (
        <EmptyState
          title="Invalid payment link"
          description="The payment identifier format is invalid. Please return to your payments history."
          action={
            <Button asChild>
              <Link href="/customer/payments">Go to payments</Link>
            </Button>
          }
        />
      )}

      {loading && !payment && <LoadingState label="Loading payment status…" />}

      {!!error && (
        <ErrorNotice
          title="Could not load payment status"
          action={
            <Button
              variant="outline"
              onClick={reload}
              disabled={delay > 0}
              className="mt-2"
            >
              {delay > 0 ? `Retry in ${delay}s` : "Try again"}
            </Button>
          }
        >
          {errorMessage(error)}
        </ErrorNotice>
      )}

      {payment && (
        <div className="space-y-6">
          {/* Status banner */}
          {payment.status === "PENDING" && (
            <Alert className="border-amber-500/30 bg-amber-500/10">
              <Clock className="size-5 text-amber-600" />
              <AlertTitle className="text-amber-800">
                Payment Verification Pending
              </AlertTitle>
              <AlertDescription className="text-amber-700">
                Your checkout session was created. ExpressHub confirms settlement automatically through verified Stripe webhooks.
                {pollingCount < maxPolls
                  ? " Checking for updates in the background…"
                  : " Verification is taking longer than expected. Use the Refresh button when your payment finishes."}
              </AlertDescription>
            </Alert>
          )}

          {payment.status === "PAID" && (
            <Alert className="border-green-600/30 bg-green-600/10">
              <CheckCircle2 className="size-5 text-green-700" />
              <AlertTitle className="text-green-800">
                Payment Verified & Confirmed
              </AlertTitle>
              <AlertDescription className="text-green-700">
                This transaction has been successfully settled via Stripe. Your shipment is confirmed and eligible for courier assignment.
              </AlertDescription>
            </Alert>
          )}

          {payment.status === "FAILED" && (
            <Alert variant="destructive">
              <AlertTriangle className="size-5" />
              <AlertTitle>Payment Failed</AlertTitle>
              <AlertDescription>
                This checkout attempt was not completed. You can start a fresh checkout attempt from your shipment details screen.
              </AlertDescription>
            </Alert>
          )}

          {/* Payment summary grid */}
          <Card>
            <CardContent className="shipment-summary p-6">
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <div className="mt-2">
                  <StatusBadge status={payment.status} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Total amount</span>
                <p className="font-bold text-2xl mt-1">
                  {money(payment.amount, payment.currency)}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Provider</span>
                <p className="font-medium text-base mt-1">Stripe Checkout</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Created</span>
                <p className="text-sm mt-1">
                  <time dateTime={payment.createdAt}>
                    {dateTime(payment.createdAt)}
                  </time>
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Associated Shipment */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="size-4" /> Associated Shipment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">Shipment Reference</span>
                  <p className="font-mono text-sm break-all mt-1">{payment.shipmentId}</p>
                </div>
                <div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/customer/shipments/${payment.shipmentId}`}>
                      View Shipment Details
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Audit / Timeline Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="size-4" /> Settlement Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Initiated Date</span>
                  <p className="mt-0.5">{dateTime(payment.createdAt)}</p>
                </div>
                {payment.paidAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">Verified Settlement Date</span>
                    <p className="mt-0.5 text-green-700 font-medium">
                      {dateTime(payment.paidAt)}
                    </p>
                  </div>
                )}
                {payment.refundedAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">Refund Date</span>
                    <p className="mt-0.5 text-amber-700 font-medium">
                      {dateTime(payment.refundedAt)}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground">Last Updated</span>
                  <p className="mt-0.5">{dateTime(payment.updatedAt)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
