"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { MapPin, Phone, Package, Clock3, RefreshCw, Navigation, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
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
import { StatusTransitionControl } from "@/features/shipments/status-transition";

export function CourierShipmentDetailView({ id }: { id: string }) {
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
      <Link href="/courier/shipments" className="back-link">
        <ArrowLeft className="inline size-4" aria-hidden="true" /> Back to assigned shipments
      </Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Delivery Stop</p>
          <h1>Delivery Operations</h1>
          <p className="break-all font-mono font-medium text-base">
            {shipment?.trackingNumber ?? "Loading shipment assignment…"}
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
          title="Invalid shipment link"
          description="The shipment identifier provided is not valid. Return to your assignments."
          action={
            <Button asChild>
              <Link href="/courier/shipments">View assigned shipments</Link>
            </Button>
          }
        />
      )}

      {loading && <LoadingState label="Loading delivery details…" />}

      {!!error && (
        <ErrorNotice
          title={
            error instanceof ApiError && error.status === 404
              ? "Assignment not found"
              : "Could not load delivery assignment"
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
          {/* Status Overview Card */}
          <Card>
            <CardContent className="shipment-summary">
              <div>
                <span className="text-xs text-muted-foreground">Delivery status</span>
                <div className="mt-2">
                  <StatusBadge status={shipment.status} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Payment confirmation</span>
                <div className="mt-2">
                  <StatusBadge status={shipment.paymentStatus} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Delivery fee</span>
                <p className="font-semibold text-lg">{money(shipment.price, shipment.currency)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Assigned on</span>
                <p className="text-sm">
                  <time dateTime={shipment.createdAt}>{dateTime(shipment.createdAt)}</time>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Operational Action Stepper */}
          <StatusTransitionControl
            shipment={shipment}
            role="COURIER"
            onSuccess={reload}
          />

          {/* Route & Contact Cards */}
          <div className="shipment-detail-grid">
            {/* Pickup */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="size-5 text-amber-600" />
                  Pickup Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">Sender Contact:</span>
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
                  <span className="text-xs text-muted-foreground">Pickup Address:</span>
                  <p className="text-sm font-medium whitespace-pre-wrap mt-0.5">
                    {shipment.pickupAddress}
                  </p>
                </div>
                {shipment.pickupScheduledAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">Preferred Pickup Time:</span>
                    <p className="text-sm font-medium mt-0.5">
                      {dateTime(shipment.pickupScheduledAt)}
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
                  Delivery Destination
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">Recipient Name:</span>
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
                  <span className="text-xs text-muted-foreground">Destination Address:</span>
                  <p className="text-sm font-medium whitespace-pre-wrap mt-0.5">
                    {shipment.deliveryAddress}
                  </p>
                </div>
                {shipment.deliveredAt && (
                  <div className="flex items-center gap-1.5 text-sm text-emerald-700 font-medium">
                    <CheckCircle2 className="size-4" />
                    <span>Delivered at: {dateTime(shipment.deliveredAt)}</span>
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
                Package Specifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">Weight:</span>
                  <p className="font-semibold">{shipment.parcelWeightKg} kg</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Dimensions (L × W × H):</span>
                  <p className="font-semibold">
                    {shipment.parcelLengthCm
                      ? `${shipment.parcelLengthCm} × ${shipment.parcelWidthCm} × ${shipment.parcelHeightCm} cm`
                      : "Standard"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Payment Status:</span>
                  <p className="font-semibold">
                    {shipment.paymentStatus === "PAID" ? (
                      <span className="text-emerald-700">Paid in Full</span>
                    ) : (
                      <span className="text-amber-700">Pending Payment</span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Recipient Verified:</span>
                  <p className="font-semibold">
                    {shipment.status === "DELIVERED" ? "Yes - Confirmed" : "Pending Handover"}
                  </p>
                </div>
              </div>

              {shipment.packageDescription && (
                <div className="pt-2 border-t mt-3">
                  <span className="text-xs text-muted-foreground">Package Description / Handling Notes:</span>
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
                Delivery Event Log
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
                        {dateTime(event.occurredAt)}
                      </time>
                      {event.publicNote && <p className="break-words mt-1">{event.publicNote}</p>}
                    </motion.li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  title="No delivery events recorded"
                  description="Status updates recorded on this shipment will appear here in chronological sequence."
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
