"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { Clock3, Package, MapPin, Loader2, RefreshCw, CheckCircle2, ArrowLeft } from "lucide-react";
import { PayWithStripeButton } from "@/features/payments/initiate-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusBadge, ErrorNotice, EmptyState } from "@/components/ui/primitives";
import { useSession } from "@/features/auth/provider";
import { errorMessage, ApiError } from "@/lib/client/api";
import { dateTime, money, statusLabel, type ShipmentDetail } from "./contracts";
import { useResource, useRetryDelay } from "./use-resource";

export function ShipmentDetails({ id }: { id: string }) {
  const { store } = useSession();
  const valid = z.cuid().safeParse(id).success;
  const { data, loading, refreshing, error, reload } = useResource<{ shipment: ShipmentDetail }>(valid ? `/shipments/${encodeURIComponent(id)}` : null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [cancelled, setCancelled] = useState(false);
  const delay = useRetryDelay(error ?? mutationError);
  const shipment = data?.shipment;
  const events = useMemo(() => [...(shipment?.events ?? [])].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id)), [shipment]);

  async function cancel() {
    if (!shipment || shipment.status !== "CREATED" || pending.current || delay) return;
    pending.current = true; setBusy(true); setMutationError(null); setCancelled(false);
    try {
      await store.api.request(`/shipments/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status: "CANCELLED", expectedStatus: shipment.status } });
      setCancelled(true);
      toast.success("Shipment cancelled", "The cancellation was confirmed. Cancellation does not automatically refund a payment.");
    } catch (error) {
      setMutationError(error);
      const msg = `${(error instanceof ApiError && error.status === 409 ? error.message : errorMessage(error)).replace(/[.\s]+$/, "")}. Review the latest shipment details before trying again. Cancellation does not automatically refund payments.${delay > 0 ? ` Try again in ${delay} seconds.` : ""}`;
      toast.error("Cancellation could not be confirmed", msg);
    }
    finally { pending.current = false; setBusy(false); setOpen(false); reload(); }
  }

  return <div className="page-stack">
    <Link href="/customer/shipments" className="back-link"><ArrowLeft className="inline size-4" aria-hidden="true" /> My shipments</Link>
    <div className="page-heading"><div><p className="eyebrow">Every step of the journey</p><h1>Shipment details</h1><p>Your shipment information and delivery history.</p></div>{valid && <Button variant="outline" disabled={loading || refreshing || busy || delay > 0} onClick={reload}><RefreshCw />Refresh</Button>}</div>
    {!valid && <EmptyState title="Shipment unavailable" description="This shipment link is invalid. Return to your shipment list." />}
    {refreshing && <ResourceRefresh />}
    {loading && <ResourceSkeleton variant="detail" label="Loading shipment details…" />}
    {!!error && <ErrorNotice title={error instanceof ApiError && error.status === 404 ? "Shipment unavailable" : "Could not load shipment"} action={<Button variant="outline" onClick={reload} disabled={delay > 0}>{delay ? `Retry in ${delay}s` : "Try again"}</Button>}>{errorMessage(error)}</ErrorNotice>}
    {shipment && <>
      <Card>
        <CardHeader className="border-b pb-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Package className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Tracking number</p>
              <p className="mt-1 break-all font-mono text-sm font-semibold tracking-wide text-foreground select-all">{shipment.trackingNumber}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="shipment-summary"><div><span className="text-xs text-muted-foreground">Shipment status</span><div className="mt-2"><StatusBadge status={shipment.status} /></div></div><div><span className="text-xs text-muted-foreground">Payment status</span><div className="mt-2"><StatusBadge status={shipment.paymentStatus} /></div></div><div><span className="text-xs text-muted-foreground">Shipment price</span><p className="font-semibold text-xl">{money(shipment.price, shipment.currency)}</p></div><div><span className="text-xs text-muted-foreground">Created</span><p><time dateTime={shipment.createdAt}>{dateTime(shipment.createdAt)}</time></p></div></CardContent></Card>
      <div className="shipment-detail-grid">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="size-5" />Delivery route</CardTitle></CardHeader><CardContent className="space-y-6 break-words"><Address title="Pickup" name={shipment.pickupContactName} phone={shipment.pickupContactPhone} address={shipment.pickupAddress} /><Address title="Delivery" name={shipment.deliveryContactName} phone={shipment.deliveryContactPhone} address={shipment.deliveryAddress} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Package className="size-5" />Parcel details</CardTitle></CardHeader><CardContent className="space-y-3 break-words"><p><strong>Weight:</strong> {shipment.parcelWeightKg} kg</p><p>{shipment.packageDescription || "No parcel description provided."}</p><p><strong>Preferred pickup:</strong> {shipment.pickupScheduledAt ? dateTime(shipment.pickupScheduledAt) : "Not specified"}</p>{shipment.deliveredAt && <p><strong>Delivered:</strong> {dateTime(shipment.deliveredAt)}</p>}<p className="text-xs">Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="size-5" />Shipment history</CardTitle></CardHeader><CardContent>{events.length ? <ol className="shipment-timeline">{events.map((event, idx) => <motion.li initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.07, duration: 0.3 }} key={event.id}><div className="flex flex-wrap items-center gap-3"><h3 className="text-base">{statusLabel(event.type)}</h3>{event.toStatus && <StatusBadge status={event.toStatus} />}</div><time className="text-sm text-muted-foreground" dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time>{event.publicNote && <p className="break-words">{event.publicNote}</p>}</motion.li>)}</ol> : <EmptyState title="No history yet" description="Delivery updates will appear here as your shipment progresses." />}</CardContent></Card>
      <Card><CardHeader><CardTitle>Next steps</CardTitle></CardHeader><CardContent className="space-y-4">
        {shipment.status === "CREATED" && (shipment.paymentStatus === "PENDING" || shipment.paymentStatus === "FAILED") && (
          <div className="p-4 rounded-xl border bg-muted/40 space-y-3">
            <div>
              <h4 className="font-semibold text-base">Payment Required</h4>
              <p className="text-sm text-muted-foreground mt-0.5">
                Pay to confirm your booking.
              </p>
            </div>
            <PayWithStripeButton
              shipmentId={shipment.id}
              trackingNumber={shipment.trackingNumber}
              price={shipment.price}
              currency={shipment.currency}
            />
          </div>
        )}
        {shipment.paymentStatus === "PAID" && (
          <div className="p-4 rounded-xl border border-green-600/30 bg-green-600/10 text-green-950 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-700" />
              <h4 className="font-semibold text-base">Payment received</h4>
            </div>
            <p className="text-sm text-green-800">
              {money(shipment.price, shipment.currency)} paid.
            </p>
            <div className="pt-1">
              <Button variant="outline" size="sm" asChild className="bg-white hover:bg-white/90">
                <Link href={`/customer/payments?shipmentId=${shipment.id}`}>
                  View payment
                </Link>
              </Button>
            </div>
          </div>
        )}
        {shipment.status === "CREATED" ? <><p className="text-sm text-muted-foreground">You can request cancellation before pickup. An open Checkout session may prevent cancellation. Cancelling does not automatically refund a payment.</p><Button variant="destructive" disabled={busy || delay > 0} onClick={() => setOpen(true)}>Cancel shipment</Button></> : <p className="text-sm text-muted-foreground">This shipment can no longer be cancelled by a customer.</p>}
      </CardContent></Card>
      <Dialog open={open} onOpenChange={value => { if (!pending.current) setOpen(value); }}><DialogContent onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }} onPointerDownOutside={event => { if (pending.current) event.preventDefault(); }} showCloseButton={!busy}><DialogHeader><DialogTitle>Cancel this shipment?</DialogTitle><DialogDescription>This action cannot be undone. An open Checkout session may block cancellation. Cancelling a shipment does not automatically refund any payment.</DialogDescription></DialogHeader><div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} autoFocus onClick={() => setOpen(false)}>Keep shipment</Button><Button variant="destructive" disabled={busy || delay > 0} onClick={cancel}>{busy && <Loader2 className="animate-spin" />}{busy ? "Cancelling…" : "Confirm cancellation"}</Button></div></DialogContent></Dialog>
    </>}
  </div>;
}
function Address({ title, name, phone, address }: { title: string; name: string; phone: string; address: string }) {
  return <section><h3 className="text-base mb-2">{title}</h3><p className="font-medium">{name}</p><p>{phone}</p><p className="whitespace-pre-wrap">{address}</p></section>;
}
