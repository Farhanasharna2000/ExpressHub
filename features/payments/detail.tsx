"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { z } from "zod";
import {
  CreditCard,
  RefreshCw,
  Clock,
  AlertTriangle,
  ArrowLeft,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  StatusBadge,
  ErrorNotice,
  EmptyState,
} from "@/components/ui/primitives";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";
import { errorMessage } from "@/lib/client/api";
import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/i18n/use-format";
import {
  dateTime,
  type PaymentDetailResponse,
} from "./contracts";

export function PaymentDetailsView({ id }: { id: string }) {
  const t = useTranslations("payments.detail");
  const f = useFormat();
  const when = (iso: string) => (f.locale === "en" ? dateTime(iso) : f.dateTime(iso));
  const isValidId = z.string().cuid().safeParse(id).success;
  const { data, loading, refreshing, error, reload } = useResource<PaymentDetailResponse>(
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
        <ArrowLeft className="size-4" /> {t("back")}
      </Link>

      <div className="page-heading">
        <div>
          <h1>{t("title")}</h1>
          <p className="break-all font-mono text-xs sm:text-sm text-muted-foreground">
            {payment?.id ?? t("loading")}
          </p>
        </div>
        {isValidId && !error && payment?.status === "PENDING" && (
          <Button
            variant="outline"
            disabled={loading || refreshing || delay > 0}
            onClick={() => {
              setPollingCount(0);
              reload();
            }}
            className="gap-2"
          >
            <RefreshCw className={loading || refreshing ? "animate-spin size-4" : "size-4"} />
            {loading || refreshing ? t("checking") : t("refresh")}
          </Button>
        )}
      </div>

      {!isValidId && (
        <EmptyState
          title={t("invalid")}
          description={t("invalidText")}

        />
      )}

      {refreshing && <ResourceRefresh />}
      {loading && !payment && <ResourceSkeleton variant="detail" label={t("checkingLabel")} />}

      {!!error && (
        <ErrorNotice
          title={t("loadFailed")}
          action={
            <Button
              variant="outline"
              onClick={reload}
              disabled={delay > 0}
              className="mt-2"
            >
              {delay > 0 ? t("retryIn", { seconds: f.digits(delay) }) : t("tryAgain")}
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
                {t("pending")}
              </AlertTitle>
              <AlertDescription className="text-amber-700">
                {pollingCount < maxPolls ? t("pendingAuto") : t("pendingSlow")}
              </AlertDescription>
            </Alert>
          )}

          {payment.status === "FAILED" && (
            <Alert variant="destructive">
              <AlertTriangle className="size-5" />
              <AlertTitle>{t("failed")}</AlertTitle>
              <AlertDescription>
                {t("failedText")}
              </AlertDescription>
            </Alert>
          )}

          {/* Payment summary grid */}
          <Card>
            <CardContent className="shipment-summary p-6">
              <div>
                <span className="text-xs text-muted-foreground">{t("status")}</span>
                <div className="mt-2">
                  <StatusBadge status={payment.status} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t("total")}</span>
                <p className="font-bold text-2xl mt-1">
                  {f.money(payment.amount, payment.currency)}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Shipment */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="size-4" /> {t("shipment")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">{t("shipmentId")}</span>
                  <p className="font-mono text-sm break-all mt-1">{payment.shipmentId}</p>
                </div>
                <div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/customer/shipments/${payment.shipmentId}`}>
                      {t("viewShipment")}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Audit / Timeline Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="size-4" /> {t("dates")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">{t("created")}</span>
                  <p className="mt-0.5">{when(payment.createdAt)}</p>
                </div>
                {payment.paidAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">{t("paid")}</span>
                    <p className="mt-0.5 text-green-700 font-medium">
                      {when(payment.paidAt)}
                    </p>
                  </div>
                )}
                {payment.refundedAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">{t("refunded")}</span>
                    <p className="mt-0.5 text-amber-700 font-medium">
                      {when(payment.refundedAt)}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground">{t("updated")}</span>
                  <p className="mt-0.5">{when(payment.updatedAt)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
