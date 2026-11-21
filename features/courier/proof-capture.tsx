"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, CheckCircle2, CloudUpload, Keyboard, Loader2, PenLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input as TextInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { errorMessage } from "@/lib/client/api";
import { recipientNameSchema } from "@/validators/proof";
import type { ShipmentDetail } from "@/features/shipments/contracts";
import { preparePhoto, signatureToBlob, typedSignature } from "./proof-image";
import { attemptDelivery, deliveryQueue, type PendingDelivery } from "./proof-queue";
import { useDeliveryQueue } from "./pwa";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/i18n/use-format";
import { translateKnownMessage } from "@/lib/i18n/bridge";
export function DeliveryProofCard({ shipment, onDelivered }: { shipment: ShipmentDetail; onDelivered: () => void }) {
  const t = useTranslations("courier");
  const f = useFormat();
  const { store, user } = useSession();
  const ids = useId();
  const queued = useDeliveryQueue(user?.id).find((item) => item.shipmentId === shipment.id);
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [recipientName, setRecipientName] = useState(shipment.deliveryContactName ?? "");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [typed, setTyped] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPreparing(true);
    setError(null);
    try {
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
      setPreview(URL.createObjectURL(prepared));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("thePhotoCouldNot"));
    } finally {
      setPreparing(false);
    }
  }

  function removePhoto() {
    setPhoto(null);
    setPreview(null);
  }

  async function submit() {
    if (busy || !user) return;
    const name = recipientNameSchema.safeParse(recipientName);
    if (!name.success) return setError(name.error.issues[0]?.message ?? t("enterTheRecipientS"));
    if (typed && typedName.trim().length < 2) return setError(t("typeTheRecipientS"));
    const signed = typed || hasInk;
    if (!photo && !signed) return setError(t("addAPhotoOf"));

    setBusy(true);
    setError(null);
    try {
      const signature = typed ? await typedSignature(typedName.trim()) : hasInk && signatureRef.current?.canvas ? await signatureToBlob(signatureRef.current.canvas) : undefined;
      const item: PendingDelivery = {
        id: crypto.randomUUID(),
        courierId: user.id,
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        recipientName: name.data,
        note: note.trim() || undefined,
        capturedAt: new Date().toISOString(),
        photo: photo ?? undefined,
        signature,
        attempts: 0,
      };
      const result = navigator.onLine ? await attemptDelivery(store.api, item) : { outcome: "retry" as const, error: undefined };
      if (result.outcome === "delivered") {
        toast.success(t("delivered"), t("markedDelivered", { tracking: shipment.trackingNumber }));
        onDelivered();
      } else if (result.outcome === "retry" && deliveryQueue.supported()) {
        await deliveryQueue.put({ ...item, attempts: 1 });
        toast.success(t("savedOnThisPhone"), t("noConnectionRightNow"));
      } else {
        setError(errorMessage(result.error));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("theProofCouldNot"));
    } finally {
      setBusy(false);
    }
  }

  async function retryQueued(item: PendingDelivery) {
    setBusy(true);
    const result = await attemptDelivery(store.api, item);
    setBusy(false);
    if (result.outcome === "delivered") {
      await deliveryQueue.remove(item.id);
      onDelivered();
    } else {
      await deliveryQueue.put({ ...item, attempts: item.attempts + 1, failed: result.outcome === "failed" });
      setError(errorMessage(result.error));
    }
  }

  if (queued) {
    return (
      <Card className="border-amber-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudUpload className="size-5 text-amber-600" aria-hidden="true" /> {t("waitingToUpload")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm" aria-live="polite">
          <p>
            {t.rich("proofSaved", { b: (chunks) => <strong>{chunks}</strong>, name: queued.recipientName, time: f.locale === "en" ? new Date(queued.capturedAt).toLocaleTimeString() : f.clock(queued.capturedAt).split(", ").pop() ?? "" })}
            {queued.failed ? t("theServerRejectedIt") : t("itUploadsAutomaticallyWhen")}
          </p>
          {(error || queued.lastError) && <p role="alert" className="text-destructive">{translateKnownMessage(error ?? queued.lastError ?? "")}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={() => void retryQueued(queued)} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CloudUpload className="size-4" aria-hidden="true" />} {t("tryUploadNow")}
            </Button>
            {queued.failed && (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => void deliveryQueue.remove(queued.id)} disabled={busy}>
                {t("discardAndCaptureAgain")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" /> {t("proofOfDelivery")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("takeAPhotoOf")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={`${ids}-name`}>{t("receivedBy")}</Label>
          <TextInput id={`${ids}-name`} value={recipientName} onChange={(event) => setRecipientName(event.target.value)} autoComplete="off" maxLength={100} className="min-h-11 text-base" disabled={busy} />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">{t("photo")}</span>
          {preview ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={preview} alt={t("deliveryPhotoToBe")} className="max-h-64 rounded-lg border object-contain" />
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={removePhoto} disabled={busy}>
                <Trash2 className="size-4" aria-hidden="true" /> {t("removePhoto")}
              </Button>
            </div>
          ) : (
            <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring">
              {preparing ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Camera className="size-5" aria-hidden="true" />}
              {preparing ? t("preparingPhoto") : t("takeOrChooseA")}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => void choosePhoto(event)} disabled={busy || preparing} />
            </label>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span id={`${ids}-signature`} className="text-sm font-medium">{typed ? t("signedByTypedName") : t("recipientSignature")}</span>
            <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => { setTyped(!typed); setHasInk(false); }} disabled={busy}>
              {typed ? <><PenLine className="size-4" aria-hidden="true" /> {t("drawASignatureInstead")}</> : <><Keyboard className="size-4" aria-hidden="true" /> {t("typeTheNameInstead")}</>}
            </Button>
          </div>
          {typed ? (
            <div className="space-y-1">
              <Label htmlFor={`${ids}-typed`} className="sr-only">{t("recipientNameAsSignature")}</Label>
              <TextInput id={`${ids}-typed`} value={typedName} onChange={(event) => setTypedName(event.target.value)} placeholder={t("recipientSFullName")} maxLength={60} className="min-h-11 text-base" disabled={busy} />
              <p className="text-xs text-muted-foreground">{t("useThisWhenThe")}</p>
            </div>
          ) : (
            <SignaturePad ref={signatureRef} onChange={setHasInk} disabled={busy} labelId={`${ids}-signature`} />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${ids}-note`}>{t("deliveryNoteOptional")}</Label>
          <TextInput id={`${ids}-note`} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("forExampleLeftWith")} maxLength={300} className="min-h-11 text-base" disabled={busy} />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <Button type="button" className="min-h-12 w-full text-base" onClick={() => void submit()} disabled={busy || preparing}>
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-5" aria-hidden="true" />}
          {busy ? t("savingProof") : t("confirmDelivery")}
        </Button>
      </CardContent>
    </Card>
  );
}
