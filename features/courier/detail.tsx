"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import { useState } from "react";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { MapPin, Phone, Package, Clock3, RefreshCw, Navigation, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import {
  StatusBadge,
  ErrorNotice,
  EmptyState,
} from "@/components/ui/primitives";
import { errorMessage, ApiError } from "@/lib/client/api";
import {
  type ShipmentDetail,
} from "@/features/shipments/contracts";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";
import { StatusTransitionControl } from "@/features/shipments/status-transition";
import { DeliveryProofView } from "@/features/shipments/proof-view";
import { DeliveryProofCard } from "./proof-capture";
import { LiveLocationToggle } from "./live-location";

import { useTranslations } from "next-intl";
import { useFormat, useStatusLabel } from "@/lib/i18n/use-format";
export function CourierShipmentDetailView({ id }: { id: string }) {
  const t = useTranslations("courier");
  const tf = useTranslations("filters");
  const f = useFormat();
  const statusLabel = useStatusLabel();
  // Set when this courier confirms the delivery here, so the proof card can celebrate it.
  const [justDelivered, setJustDelivered] = useState(false);
  const valid = z.cuid().safeParse(id).success;
  const { data, loading, refreshing, error, reload } = useResource<{ shipment: ShipmentDetail }>(
    valid ? `/shipments/${encodeURIComponent(id)}` : null
  );
  const delay = useRetryDelay(error);
  const shipment = data?.shipment;

  const events = useMemo(
    () =>
      [...(shipment?.events ?? [])].sort(
        (a, b) =>
          Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id)
      ),
    [shipment]
  );

  return (
    <div className="page-stack">
      <Link href="/courier/shipments" className="back-link">
        <ArrowLeft className="inline size-4" aria-hidden="true" /> {t("backToAssigned")}
      </Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("deliveryStop")}</p>
          <h1>{t("deliveryOperations")}</h1>
          <p className="break-all font-mono font-medium text-base">
            {shipment?.trackingNumber ?? t("loadingShipmentAssignment")}
          </p>
        </div>
        {valid && (
          <Button
            variant="outline"
            disabled={loading || refreshing || delay > 0}
            onClick={reload}
          >
            <RefreshCw className={`size-4 mr-2 ${loading || refreshing ? "animate-spin" : ""}`} />
            {t("refresh")}
          </Button>
        )}
      </div>

      {!valid && (
        <EmptyState
          title={t("invalidShipmentLink")}
          description={t("theShipmentIdentifierProvided")}
          action={
            <Button asChild>
              <Link href="/courier/shipments">{t("viewAssigned")}</Link>
            </Button>
          }
        />
      )}

      {refreshing && <ResourceRefresh />}
      {loading && <ResourceSkeleton variant="detail" label={t("loadingDeliveryDetails")} />}

      {!!error && (
        <ErrorNotice
          title={
            error instanceof ApiError && error.status === 404
              ? t("assignmentNotFound")
              : t("couldNotLoadDelivery2")
          }
          action={
            <Button variant="outline" onClick={reload} disabled={delay > 0}>
              {delay ? tf("retryIn", { seconds: f.digits(delay) }) : t("tryAgain")}
            </Button>
          }
        >
          {errorMessage(error)}
        </ErrorNotice>
      )}

      {shipment && (
        <>
          {/* Status Overview Card */}
          <Card>
            <CardContent className="shipment-summary">
              <div>
                <span className="text-xs text-muted-foreground">{t("deliveryStatus")}</span>
                <div className="mt-2">
                  <StatusBadge status={shipment.status} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t("paymentConfirmation")}</span>
                <div className="mt-2">
                  <StatusBadge status={shipment.paymentStatus} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t("deliveryFee")}</span>
                <p className="font-semibold text-lg">{f.money(shipment.price, shipment.currency)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t("assignedOn")}</span>
                <p className="text-sm">
                  <time dateTime={shipment.createdAt}>{f.dateTime(shipment.createdAt)}</time>
                </p>
              </div>
            </CardContent>
          </Card>

          {shipment.status === "OUT_FOR_DELIVERY" && <LiveLocationToggle />}

          {shipment.status === "OUT_FOR_DELIVERY" && (
            <DeliveryProofCard shipment={shipment} onDelivered={() => { setJustDelivered(true); reload(); }} />
          )}

          {/* Operational Action Stepper */}
          <StatusTransitionControl
            shipment={shipment}
            role="COURIER"
            onSuccess={reload}
            hiddenTargets={["DELIVERED"]}
          />

          {shipment.deliveryProof && <DeliveryProofView shipmentId={shipment.id} proof={shipment.deliveryProof} celebrate={justDelivered} />}

          {/* Route & Contact Cards */}
          <div className="shipment-detail-grid">
            {/* Pickup */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="size-5 text-amber-600" />
                  {t("pickupInformation")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">{t("senderContact")}</span>
                  <p className="font-semibold text-base">{shipment.pickupContactName}</p>
                  <a
                    href={`tel:${shipment.pickupContactPhone}`}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-1"
                  >
                    <Phone className="size-3.5" />
                    {shipment.pickupContactPhone}
                  </a>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("pickupAddress")}</span>
                  <p className="text-sm font-medium whitespace-pre-wrap mt-0.5">
                    {shipment.pickupAddress}
                  </p>
                </div>
                {shipment.pickupScheduledAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">{t("preferredPickupTime")}</span>
                    <p className="text-sm font-medium mt-0.5">
                      {f.dateTime(shipment.pickupScheduledAt)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recipient */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Navigation className="size-5 text-emerald-600" />
                  {t("deliveryDestination")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">{t("recipientName")}</span>
                  <p className="font-semibold text-base">{shipment.deliveryContactName}</p>
                  <a
                    href={`tel:${shipment.deliveryContactPhone}`}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-1"
                  >
                    <Phone className="size-3.5" />
                    {shipment.deliveryContactPhone}
                  </a>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("destinationAddress")}</span>
                  <p className="text-sm font-medium whitespace-pre-wrap mt-0.5">
                    {shipment.deliveryAddress}
                  </p>
                </div>
                {shipment.deliveredAt && (
                  <div className="flex items-center gap-1.5 text-sm text-emerald-700 font-medium">
                    <CheckCircle2 className="size-4" />
                    <span>{t("deliveredAt", { time: f.dateTime(shipment.deliveredAt) })}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Parcel Specifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="size-5" />
                {t("packageSpecifications")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">{t("weight")}</span>
                  <p className="font-semibold">{shipment.parcelWeightKg} kg</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("paymentStatus")}</span>
                  <p className="font-semibold">
                    {shipment.paymentStatus === "PAID" ? (
                      <span className="text-emerald-700">{t("paidInFull")}</span>
                    ) : (
                      <span className="text-amber-700">{t("pendingPayment")}</span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("recipientVerified")}</span>
                  <p className="font-semibold">
                    {shipment.status === "DELIVERED" ? t("yesConfirmed") : t("pendingHandover")}
                  </p>
                </div>
              </div>

              {shipment.packageDescription && (
                <div className="pt-2 border-t mt-3">
                  <span className="text-xs text-muted-foreground">{t("packageDescriptionHandlingNotes")}</span>
                  <p className="text-sm mt-0.5">{shipment.packageDescription}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delivery Timeline / Events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="size-5" />
                {t("deliveryEventLog")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {events.length ? (
                <ol className="shipment-timeline">
                  {events.map((event, idx) => (
                    <motion.li
                      key={event.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.07, duration: 0.3 }}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-base">{statusLabel(event.type)}</h3>
                        {event.toStatus && <StatusBadge status={event.toStatus} />}
                      </div>
                      <time className="text-sm text-muted-foreground" dateTime={event.occurredAt}>
                        {f.dateTime(event.occurredAt)}
                      </time>
                      {event.publicNote && <p className="break-words mt-1">{event.publicNote}</p>}
                    </motion.li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  title={t("noDeliveryEventsRecorded")}
                  description={t("statusUpdatesRecordedOn")}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
