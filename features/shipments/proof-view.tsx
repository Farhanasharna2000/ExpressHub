"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, useGSAP, whenMotionAllowed } from "@/lib/gsap";
import { BadgeCheck, ImageOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/features/auth/provider";
import type { DeliveryProofSummary, ProofKind } from "@/lib/delivery-proof";
import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/i18n/use-format";

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
  const t = useTranslations("proof");
  const { url, failed } = useProofImage(shipmentId, kind, enabled);
  if (!enabled) return null;
  if (failed) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ImageOff className="size-4" aria-hidden="true" /> {t("loadFailed", { kind: t(kind) })}
      </p>
    );
  }
  if (!url) return <div className="h-40 w-full animate-pulse rounded-lg bg-muted" aria-label={t("loadingKind", { kind: t(kind) })} role="img" />;
  // eslint-disable-next-line @next/next/no-img-element -- authorised blob URL, not optimisable by next/image
  return <img src={url} alt={alt} className="max-h-72 w-full rounded-lg border bg-white object-contain" />;
}

export function DeliveryProofView({ shipmentId, proof, celebrate = false }: { shipmentId: string; proof: DeliveryProofSummary; celebrate?: boolean }) {
  const t = useTranslations("proof");
  const f = useFormat();
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!celebrate) return;
    whenMotionAllowed(() => {
      const check = scope.current?.querySelector<SVGPathElement>("[data-anim=check]");
      const pop = gsap.timeline({ defaults: { ease: "power3.out" } });
      pop.fromTo(scope.current, { opacity: 0, scale: 0.96, y: 12 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, clearProps: "opacity,transform" });
      if (check) {
        const length = check.getTotalLength();
        pop.fromTo(check, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.out", clearProps: "strokeDasharray,strokeDashoffset" }, 0.2);
      }
    });
  }, { scope, dependencies: [celebrate] });

  return (
    <Card ref={scope}>
      <CardHeader>
        {celebrate && (
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-700" role="status">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path data-anim="check" d="M4.5 12.5l5 5L19.5 7" />
            </svg>
            {t("confirmed")}
          </p>
        )}
        <CardTitle className="flex items-center gap-2">
          <BadgeCheck className="size-5 text-emerald-600" aria-hidden="true" /> {t("title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t.rich("receivedBy", {
            name: () => <strong className="text-foreground">{proof.recipientName}</strong>,
            time: () => <time dateTime={proof.capturedAt}>{f.dateTime(proof.capturedAt)}</time>,
          })}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {proof.hasPhoto && (
          <figure className="space-y-2">
            <ProofImage shipmentId={shipmentId} kind="photo" alt={t("photoAlt", { name: proof.recipientName })} enabled />
            <figcaption className="text-xs text-muted-foreground">{t("photoCaption")}</figcaption>
          </figure>
        )}
        {proof.hasSignature && (
          <figure className="space-y-2">
            <ProofImage shipmentId={shipmentId} kind="signature" alt={t("signatureAlt", { name: proof.recipientName })} enabled />
            <figcaption className="text-xs text-muted-foreground">{t("signatureCaption")}</figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  );
}
