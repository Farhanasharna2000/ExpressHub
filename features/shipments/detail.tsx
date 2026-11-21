"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { Clock3, Package, MapPin, Loader2, RefreshCw, CheckCircle2, ArrowLeft } from "lucide-react";
import { PayWithStripeButton } from "@/features/payments/initiate-button";
import { CopyTrackingLink } from "@/features/tracking/copy-tracking-link";
import { PrintLabelButton } from "./print-label-button";
import { DeliveryProofView } from "./proof-view";
import { ShipmentCourierMap } from "@/features/maps/shipment-courier-map";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusBadge, ErrorNotice, EmptyState } from "@/components/ui/primitives";
import { useSession } from "@/features/auth/provider";
import { errorMessage, ApiError } from "@/lib/client/api";
import { type ShipmentDetail } from "./contracts";
import { useTranslations } from "next-intl";
import { useFormat, useStatusLabel } from "@/lib/i18n/use-format";
import { useResource, useRetryDelay } from "./use-resource";

export function ShipmentDetails({ id }: { id: string }) {
  const t = useTranslations("shipmentDetail");
  const tf = useTranslations("filters");
  const f = useFormat();
  const statusLabel = useStatusLabel();
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
      toast.success(t("cancelled"), t("cancelledText"));
    } catch (error) {
      setMutationError(error);
      const reason = (error instanceof ApiError && error.status === 409 ? error.message : errorMessage(error)).replace(/[.\s।]+$/, "");
      const msg = `${t("cancelFailedText", { reason })}${delay > 0 ? ` ${t("tryAgainIn", { seconds: delay })}` : ""}`;
      toast.error(t("cancelFailedTitle"), msg);
    }
    finally { pending.current = false; setBusy(false); setOpen(false); reload(); }
  }

  return <div className="page-stack">
    <Link href="/customer/shipments" className="back-link"><ArrowLeft className="inline size-4" aria-hidden="true" /> {t("back")}</Link>
    <div className="page-heading"><div><p className="eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("intro")}</p></div>{valid && <Button variant="outline" disabled={loading || refreshing || busy || delay > 0} onClick={reload}><RefreshCw />{t("refresh")}</Button>}</div>
    {!valid && <EmptyState title={t("unavailable")} description={t("invalidLink")} />}
    {refreshing && <ResourceRefresh />}
    {loading && <ResourceSkeleton variant="detail" label={t("loading")} />}
    {!!error && <ErrorNotice title={error instanceof ApiError && error.status === 404 ? t("unavailable") : t("loadFailed")} action={<Button variant="outline" onClick={reload} disabled={delay > 0}>{delay ? tf("retryIn", { seconds: delay }) : tf("tryAgain")}</Button>}>{errorMessage(error)}</ErrorNotice>}
    {shipment && <>
      <Card>
        <CardHeader className="border-b pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Package className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-xs font-medium text-muted-foreground">{t("trackingNumber")}</p>
              <p className="mt-1 break-all font-mono text-sm font-semibold tracking-wide text-foreground select-all">{shipment.trackingNumber}</p>
            </div>
            {/* Wraps under the tracking number on narrow screens instead of squeezing it. */}
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {shipment.status !== "CANCELLED" && <PrintLabelButton shipmentId={shipment.id} trackingNumber={shipment.trackingNumber} />}
              <CopyTrackingLink trackingNumber={shipment.trackingNumber} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="shipment-summary"><div><span className="text-xs text-muted-foreground">{t("shipmentStatus")}</span><div className="mt-2"><StatusBadge status={shipment.status} /></div></div><div><span className="text-xs text-muted-foreground">{t("paymentStatus")}</span><div className="mt-2"><StatusBadge status={shipment.paymentStatus} /></div></div><div><span className="text-xs text-muted-foreground">{t("price")}</span><p className="font-semibold text-xl">{f.money(shipment.price, shipment.currency)}</p></div><div><span className="text-xs text-muted-foreground">{t("created")}</span><p><time dateTime={shipment.createdAt}>{f.dateTime(shipment.createdAt)}</time></p></div></CardContent></Card>
      <div className="shipment-detail-grid">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="size-5" />{t("route")}</CardTitle></CardHeader><CardContent className="space-y-6 break-words"><Address title={t("pickup")} name={shipment.pickupContactName} phone={shipment.pickupContactPhone} address={shipment.pickupAddress} /><Address title={t("delivery")} name={shipment.deliveryContactName} phone={shipment.deliveryContactPhone} address={shipment.deliveryAddress} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Package className="size-5" />{t("parcel")}</CardTitle></CardHeader><CardContent className="space-y-3 break-words"><p><strong>{t("weight")}</strong> {t("weightValue", { weight: f.digits(shipment.parcelWeightKg) })}</p><p>{shipment.packageDescription || t("noDescription")}</p><p><strong>{t("preferredPickup")}</strong> {shipment.pickupScheduledAt ? f.dateTime(shipment.pickupScheduledAt) : t("notSpecified")}</p>{shipment.deliveredAt && <p><strong>{t("delivered")}</strong> {f.dateTime(shipment.deliveredAt)}</p>}<p className="text-xs">{t("timesShown", { zone: Intl.DateTimeFormat().resolvedOptions().timeZone })}</p></CardContent></Card>
      </div>
      <ShipmentCourierMap shipmentId={shipment.id} status={shipment.status} />
      {shipment.deliveryProof && <DeliveryProofView shipmentId={shipment.id} proof={shipment.deliveryProof} />}
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="size-5" />{t("history")}</CardTitle></CardHeader><CardContent>{events.length ? <ol className="shipment-timeline">{events.map((event, idx) => <motion.li initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.07, duration: 0.3 }} key={event.id}><div className="flex flex-wrap items-center gap-3"><h3 className="text-base">{statusLabel(event.type)}</h3>{event.toStatus && <StatusBadge status={event.toStatus} />}</div><time className="text-sm text-muted-foreground" dateTime={event.occurredAt}>{f.dateTime(event.occurredAt)}</time>{event.publicNote && <p className="break-words">{event.publicNote}</p>}</motion.li>)}</ol> : <EmptyState title={t("noHistory")} description={t("noHistoryText")} />}</CardContent></Card>
      <Card><CardHeader><CardTitle>{t("nextSteps")}</CardTitle></CardHeader><CardContent className="space-y-4">
        {shipment.status === "CREATED" && (shipment.paymentStatus === "PENDING" || shipment.paymentStatus === "FAILED") && (
          <div className="p-4 rounded-xl border bg-muted/40 space-y-3">
            <div>
              <h4 className="font-semibold text-base">{t("paymentRequired")}</h4>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("paymentRequiredText")}
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
              <h4 className="font-semibold text-base">{t("paymentReceived")}</h4>
            </div>
            <p className="text-sm text-green-800">
              {t("paidAmount", { amount: f.money(shipment.price, shipment.currency) })}
            </p>
            <div className="pt-1">
              <Button variant="outline" size="sm" asChild className="bg-white hover:bg-white/90">
                <Link href={`/customer/payments?shipmentId=${shipment.id}`}>
                  {t("viewPayment")}
                </Link>
              </Button>
            </div>
          </div>
        )}
        {shipment.status === "CREATED" ? (
          <>
            <p className="text-sm text-muted-foreground">
              {shipment.paymentStatus === "PAID" ? t("cancelPaidHint") : t("cancelHint")}
            </p>
            <Button variant="destructive" disabled={busy || delay > 0} onClick={() => setOpen(true)}>
              {t("cancel")}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("cannotCancel")}</p>
        )}
      </CardContent></Card>
      <Dialog open={open} onOpenChange={value => { if (!pending.current) setOpen(value); }}><DialogContent onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }} onPointerDownOutside={event => { if (pending.current) event.preventDefault(); }} showCloseButton={!busy}><DialogHeader><DialogTitle>{t("confirmTitle")}</DialogTitle><DialogDescription>{shipment.paymentStatus === "PAID" ? t("confirmPaid") : t("confirmUnpaid")}</DialogDescription></DialogHeader><div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} autoFocus onClick={() => setOpen(false)}>{t("keep")}</Button><Button variant="destructive" disabled={busy || delay > 0} onClick={cancel}>{busy && <Loader2 className="animate-spin" />}{busy ? t("cancelling") : t("confirm")}</Button></div></DialogContent></Dialog>
    </>}
  </div>;
}
function Address({ title, name, phone, address }: { title: string; name: string; phone: string; address: string }) {
  return <section><h3 className="text-base mb-2">{title}</h3><p className="font-medium">{name}</p><p>{phone}</p><p className="whitespace-pre-wrap">{address}</p></section>;
}
