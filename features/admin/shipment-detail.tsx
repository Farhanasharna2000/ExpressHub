"use client";

import Link from "next/link";
import { useMemo } from "react";
import { z } from "zod";
import {
  MapPin,
  Phone,
  Package,
  Clock3,
  RefreshCw,
  User,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import {
  StatusBadge,
  ErrorNotice,
  LoadingState,
  EmptyState,
} from "@/components/ui/primitives";
import { errorMessage, ApiError } from "@/lib/client/api";
import {
  dateTime,
  money,
  statusLabel,
  type ShipmentDetail,
} from "@/features/shipments/contracts";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";
import { AssignCourierControl } from "@/features/shipments/assign-courier";
import { StatusTransitionControl } from "@/features/shipments/status-transition";

export function AdminShipmentDetailView({ id }: { id: string }) {
  const valid = z.cuid().safeParse(id).success;
  const { data, loading, error, reload } = useResource<{ shipment: ShipmentDetail }>(
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
        ← Back to shipment operations
      </Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Dispatch Operations</p>
          <h1>Shipment Detail & Management</h1>
          <p className="break-all font-mono font-medium text-base">
            {shipment?.trackingNumber ?? "Loading operational record…"}
          </p>
        </div>
        {valid && (
          <Button
            variant="outline"
            disabled={loading || delay > 0}
            onClick={reload}
          >
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        )}
      </div>

      {!valid && (
        <EmptyState
          title="Invalid shipment identifier"
          description="The shipment ID format is invalid. Return to the operations list."
          action={
            <Button asChild>
              <Link href="/admin/shipments">View shipments</Link>
            </Button>
          }
        />
      )}

      {loading && <LoadingState label="Loading operational shipment data…" />}

      {!!error && (
        <ErrorNotice
          title={
            error instanceof ApiError && error.status === 404
              ? "Shipment not found"
              : "Could not load shipment record"
          }
          action={
            <Button variant="outline" onClick={reload} disabled={delay > 0}>
              {delay ? `Retry in ${delay}s` : "Try again"}
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
                <span className="text-xs text-muted-foreground">Shipment status</span>
                <div className="mt-2">
                  <StatusBadge status={shipment.status} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Payment status</span>
                <div className="mt-2">
                  <StatusBadge status={shipment.paymentStatus} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Total price</span>
                <p className="font-semibold text-lg">{money(shipment.price, shipment.currency)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Customer ID</span>
                <p className="text-xs font-mono truncate max-w-[140px]" title={shipment.customerId}>
                  {shipment.customerId}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Admin Courier Assignment Card */}
          <AssignCourierControl shipment={shipment} onSuccess={reload} />

          {/* Admin Operational Actions Card */}
          <StatusTransitionControl
            shipment={shipment}
            role="ADMIN"
            onSuccess={reload}
          />

          {/* Route & Contact Cards */}
          <div className="shipment-detail-grid">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="size-5" />
                  Origin & Pickup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">Sender:</span>
                  <p className="font-semibold text-base">{shipment.pickupContactName}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Phone className="size-3.5" />
                    {shipment.pickupContactPhone}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Pickup Address:</span>
                  <p className="text-sm font-medium whitespace-pre-wrap mt-0.5">
                    {shipment.pickupAddress}
                  </p>
                </div>
                {shipment.pickupScheduledAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">Scheduled Pickup Time:</span>
                    <p className="text-sm font-medium mt-0.5">
                      {dateTime(shipment.pickupScheduledAt)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="size-5 text-emerald-600" />
                  Destination & Recipient
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">Recipient:</span>
                  <p className="font-semibold text-base">{shipment.deliveryContactName}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Phone className="size-3.5" />
                    {shipment.deliveryContactPhone}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Delivery Address:</span>
                  <p className="text-sm font-medium whitespace-pre-wrap mt-0.5">
                    {shipment.deliveryAddress}
                  </p>
                </div>
                {shipment.deliveredAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">Delivered Timestamp:</span>
                    <p className="text-sm font-semibold text-emerald-700 mt-0.5">
                      {dateTime(shipment.deliveredAt)}
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
                Parcel Specifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">Weight:</span>
                  <p className="font-semibold">{shipment.parcelWeightKg} kg</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Dimensions:</span>
                  <p className="font-semibold">
                    {shipment.parcelLengthCm
                      ? `${shipment.parcelLengthCm} × ${shipment.parcelWidthCm} × ${shipment.parcelHeightCm} cm`
                      : "Unspecified"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Created:</span>
                  <p className="text-sm font-medium">{dateTime(shipment.createdAt)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Last Updated:</span>
                  <p className="text-sm font-medium">{dateTime(shipment.updatedAt)}</p>
                </div>
              </div>

              {shipment.packageDescription && (
                <div className="pt-2 border-t mt-3">
                  <span className="text-xs text-muted-foreground">Package Description:</span>
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
                Audit & Event History
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
                            <User className="size-3" /> Actor: {event.actorId}
                          </span>
                        )}
                      </div>
                      <time className="text-sm text-muted-foreground" dateTime={event.occurredAt}>
                        {dateTime(event.occurredAt)}
                      </time>
                      {event.publicNote && (
                        <p className="break-words mt-1 text-sm">{event.publicNote}</p>
                      )}
                      {event.internalNote && (
                        <div className="p-2 rounded bg-muted/40 border border-muted-foreground/20 text-xs mt-1 text-muted-foreground">
                          <strong>Internal Note:</strong> {event.internalNote}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  title="No timeline events"
                  description="Operations performed on this shipment will be logged here."
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
