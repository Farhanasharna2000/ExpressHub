"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import { useMemo } from "react";
import { z } from "zod";
import { MapPin, Phone, Package, Clock3, RefreshCw, User, ShieldAlert, ArrowLeft } from "lucide-react";
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
import { AssignCourierControl } from "@/features/shipments/assign-courier";
import { ShipmentDispatchSuggestions } from "./dispatch-suggestions";
import { needsDispatch } from "./dispatch-contracts";
import { StatusTransitionControl } from "@/features/shipments/status-transition";
import { DeliveryProofView } from "@/features/shipments/proof-view";
import { ShipmentCourierMap } from "@/features/maps/shipment-courier-map";
import { ArchiveShipmentControl } from "@/features/shipments/archive-shipment";
import { PrintLabelButton } from "@/features/shipments/print-label-button";

import { useTranslations } from "next-intl";
import { useFormat, useStatusLabel } from "@/lib/i18n/use-format";
export function AdminShipmentDetailView({ id }: { id: string }) {
  const t = useTranslations("admin.shipmentDetail");
  const tf = useTranslations("filters");
  const f = useFormat();
  const statusLabel = useStatusLabel();
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
      <Link href="/admin/shipments" className="back-link">
        <ArrowLeft className="inline size-4" aria-hidden="true" /> {t("back")}
      </Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("dispatchOperations")}</p>
          <h1>{t("shipmentDetailManagement")}</h1>
          <p className="break-all font-mono font-medium text-base">
            {shipment?.trackingNumber ?? t("loadingOperationalRecord")}
          </p>
        </div>
        {valid && (
          <div className="flex flex-wrap gap-2">
            {shipment && shipment.status !== "CANCELLED" && (
              <PrintLabelButton shipmentId={shipment.id} trackingNumber={shipment.trackingNumber} />
            )}
            <Button
              variant="outline"
              disabled={loading || refreshing || delay > 0}
              onClick={reload}
            >
              <RefreshCw className={`size-4 mr-2 ${loading || refreshing ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </div>
        )}
      </div>

      {!valid && (
        <EmptyState
          title={t("invalidShipmentIdentifier")}
          description={t("theShipmentIdFormat")}
          action={
            <Button asChild>
              <Link href="/admin/shipments">{t("viewShipments")}</Link>
            </Button>
          }
        />
      )}

      {refreshing && <ResourceRefresh />}
      {loading && <ResourceSkeleton variant="detail" label={t("loadingOperationalShipmentData")} />}

      {!!error && (
        <ErrorNotice
          title={
            error instanceof ApiError && error.status === 404
              ? t("shipmentNotFound")
              : t("couldNotLoadShipment")
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
          {/* Summary Metric Strip */}
          <Card>
            <CardContent className="shipment-summary">
              <div>
                <span className="text-xs text-muted-foreground">{t("shipmentStatus")}</span>
                <div className="mt-2">
                  <StatusBadge status={shipment.status} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t("paymentStatus")}</span>
                <div className="mt-2">
                  <StatusBadge status={shipment.paymentStatus} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t("totalPrice")}</span>
                <p className="font-semibold text-lg">{f.money(shipment.price, shipment.currency)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t("customerId")}</span>
                <p className="text-xs font-mono truncate max-w-[140px]" title={shipment.customerId}>
                  {shipment.customerId}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Admin Courier Assignment Card */}
          <AssignCourierControl shipment={shipment} onSuccess={reload} />
          {needsDispatch(shipment) && (
            <ShipmentDispatchSuggestions shipmentId={shipment.id} trackingNumber={shipment.trackingNumber} onAssigned={reload} />
          )}

          {/* Admin Operational Actions Card */}
          <StatusTransitionControl
            shipment={shipment}
            role="ADMIN"
            onSuccess={reload}
          />

          <ShipmentCourierMap shipmentId={shipment.id} status={shipment.status} />
          {shipment.deliveryProof && <DeliveryProofView shipmentId={shipment.id} proof={shipment.deliveryProof} />}

          {/* Admin Soft-Delete Archival Card */}
          <ArchiveShipmentControl shipment={shipment} onSuccess={reload} />

          {/* Route & Contact Cards */}
          <div className="shipment-detail-grid">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="size-5" />
                  {t("originPickup")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">{t("sender")}</span>
                  <p className="font-semibold text-base">{shipment.pickupContactName}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Phone className="size-3.5" />
                    {shipment.pickupContactPhone}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("pickupAddress")}</span>
                  <p className="text-sm font-medium whitespace-pre-wrap mt-0.5">
                    {shipment.pickupAddress}
                  </p>
                </div>
                {shipment.pickupScheduledAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">{t("scheduledPickupTime")}</span>
                    <p className="text-sm font-medium mt-0.5">
                      {f.dateTime(shipment.pickupScheduledAt)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="size-5 text-emerald-600" />
                  {t("destinationRecipient")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">{t("recipient")}</span>
                  <p className="font-semibold text-base">{shipment.deliveryContactName}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Phone className="size-3.5" />
                    {shipment.deliveryContactPhone}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("deliveryAddress")}</span>
                  <p className="text-sm font-medium whitespace-pre-wrap mt-0.5">
                    {shipment.deliveryAddress}
                  </p>
                </div>
                {shipment.deliveredAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">{t("deliveredTimestamp")}</span>
                    <p className="text-sm font-semibold text-emerald-700 mt-0.5">
                      {f.dateTime(shipment.deliveredAt)}
                    </p>
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
                {t("parcelSpecifications")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">{t("weight")}</span>
                  <p className="font-semibold">{shipment.parcelWeightKg} kg</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("created")}</span>
                  <p className="text-sm font-medium">{f.dateTime(shipment.createdAt)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("lastUpdated")}</span>
                  <p className="text-sm font-medium">{f.dateTime(shipment.updatedAt)}</p>
                </div>
              </div>

              {shipment.packageDescription && (
                <div className="pt-2 border-t mt-3">
                  <span className="text-xs text-muted-foreground">{t("packageDescription")}</span>
                  <p className="text-sm mt-0.5">{shipment.packageDescription}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline with Admin-visible internal notes and operator IDs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="size-5" />
                {t("auditEventHistory")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {events.length ? (
                <ol className="shipment-timeline">
                  {events.map((event) => (
                    <li key={event.id}>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-base">{statusLabel(event.type)}</h3>
                        {event.toStatus && <StatusBadge status={event.toStatus} />}
                        {event.actorId && (
                          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                            <User className="size-3" /> {t("actor", { id: event.actorId })}
                          </span>
                        )}
                      </div>
                      <time className="text-sm text-muted-foreground" dateTime={event.occurredAt}>
                        {f.dateTime(event.occurredAt)}
                      </time>
                      {event.publicNote && (
                        <p className="break-words mt-1 text-sm">{event.publicNote}</p>
                      )}
                      {event.internalNote && (
                        <div className="p-2 rounded bg-muted/40 border border-muted-foreground/20 text-xs mt-1 text-muted-foreground">
                          {t.rich("internalNote", { b: (chunks) => <strong>{chunks}</strong>, note: event.internalNote })}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  title={t("noTimelineEvents")}
                  description={t("operationsPerformedOnThis")}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
