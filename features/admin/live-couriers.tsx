"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Navigation, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorNotice } from "@/components/ui/primitives";
import { ResourceSkeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/client/api";
import { useFormat } from "@/lib/i18n/use-format";
import { CourierMap, type MapMarker } from "@/features/maps/lazy-courier-map";
import { LOCATION_POLL_MS, usePolling } from "@/features/maps/shipment-courier-map";
import { useResource } from "@/features/shipments/use-resource";

import { useTranslations } from "next-intl";
type LiveCourier = {
  courierId: string;
  name: string;
  lat: number;
  lng: number;
  accuracy: number;
  updatedAt: string;
  shipments: { id: string; trackingNumber: string }[];
};

export function LiveCouriersView() {
  const t = useTranslations("admin.live");
  const f = useFormat();
  const { data, loading, refreshing, error, reload } = useResource<{ couriers: LiveCourier[] }>("/admin/couriers/live");
  usePolling(reload, LOCATION_POLL_MS, true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const couriers = useMemo(() => data?.couriers ?? [], [data]);
  const markers = useMemo<MapMarker[]>(() => couriers.map((courier) => ({
    id: courier.courierId,
    lat: courier.lat,
    lng: courier.lng,
    label: t("markerLabel", { name: courier.name, count: courier.shipments.length }),
    href: courier.shipments[0] ? `/admin/shipments/${encodeURIComponent(courier.shipments[0].id)}` : undefined,
  })), [couriers, t]);

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("dispatch")}</p>
          <h1>{t("liveCouriers")}</h1>
          <p>{t("couriersSharingTheirLocation")}</p>
        </div>
        <Button type="button" variant="outline" onClick={reload} disabled={refreshing}>
          <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden="true" /> {t("refresh")}
        </Button>
      </div>

      {loading ? <ResourceSkeleton label={t("loadingLiveCouriers")} /> : error ? (
        <ErrorNotice title={t("couldNotLoadLive")} action={<Button type="button" variant="outline" onClick={reload}>{t("tryAgain")}</Button>}>{errorMessage(error)}</ErrorNotice>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardContent className="pt-6">
              <CourierMap markers={markers} label={t("mapOfCouriersSharing")} className="courier-map courier-map-tall" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Navigation className="size-5" aria-hidden="true" />{t("sharingNow", { count: couriers.length })}</CardTitle></CardHeader>
            <CardContent>
              {couriers.length === 0 ? (
                <EmptyState title={t("noCouriersSharing")} description={t("couriersAppearHereWhen")} />
              ) : (
                <ul className="space-y-4" aria-live="polite">
                  {couriers.map((courier) => (
                    <li key={courier.courierId} className="space-y-1 border-b pb-3 last:border-0">
                      <p className="font-medium">{courier.name}</p>
                      <p className="text-xs text-muted-foreground">{t("updated", { age: f.age(courier.updatedAt, now), meters: f.digits(Math.round(courier.accuracy)) })}</p>
                      <ul className="flex flex-wrap gap-2 text-xs">
                        {courier.shipments.map((shipment) => (
                          <li key={shipment.id}>
                            <Link className="font-mono text-primary hover:underline" href={`/admin/shipments/${encodeURIComponent(shipment.id)}`}>{shipment.trackingNumber}</Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
