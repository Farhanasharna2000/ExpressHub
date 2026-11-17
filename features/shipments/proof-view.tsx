"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ImageOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/features/auth/provider";
import type { DeliveryProofSummary, ProofKind } from "@/lib/delivery-proof";
import { dateTime } from "./contracts";

// Images need the bearer token, so they are fetched as blobs and shown via object URLs.
function useProofImage(shipmentId: string, kind: ProofKind, enabled: boolean) {
  const { store } = useSession();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let objectUrl: string | null = null;
    let active = true;
    store.api
      .request<Blob>(`/shipments/${encodeURIComponent(shipmentId)}/proof/${kind}`, { responseType: "blob" })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [store, shipmentId, kind, enabled]);
  return { url, failed };
}

function ProofImage({ shipmentId, kind, alt, enabled }: { shipmentId: string; kind: ProofKind; alt: string; enabled: boolean }) {
  const { url, failed } = useProofImage(shipmentId, kind, enabled);
  if (!enabled) return null;
  if (failed) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ImageOff className="size-4" aria-hidden="true" /> The {kind} could not be loaded.
      </p>
    );
  }
  if (!url) return <div className="h-40 w-full animate-pulse rounded-lg bg-muted" aria-label={`Loading ${kind}`} role="img" />;
  // eslint-disable-next-line @next/next/no-img-element -- authorised blob URL, not optimisable by next/image
  return <img src={url} alt={alt} className="max-h-72 w-full rounded-lg border bg-white object-contain" />;
}

export function DeliveryProofView({ shipmentId, proof }: { shipmentId: string; proof: DeliveryProofSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeCheck className="size-5 text-emerald-600" aria-hidden="true" /> Proof of delivery
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Received by <strong className="text-foreground">{proof.recipientName}</strong> on{" "}
          <time dateTime={proof.capturedAt}>{dateTime(proof.capturedAt)}</time>
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {proof.hasPhoto && (
          <figure className="space-y-2">
            <ProofImage shipmentId={shipmentId} kind="photo" alt={`Photo taken at delivery for ${proof.recipientName}`} enabled />
            <figcaption className="text-xs text-muted-foreground">Delivery photo</figcaption>
          </figure>
        )}
        {proof.hasSignature && (
          <figure className="space-y-2">
            <ProofImage shipmentId={shipmentId} kind="signature" alt={`Signature of ${proof.recipientName}`} enabled />
            <figcaption className="text-xs text-muted-foreground">Recipient signature</figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  );
}
