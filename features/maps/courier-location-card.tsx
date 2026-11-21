"use client";

import { useEffect, useMemo, useState } from "react";
import { Navigation } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourierMap, type MapMarker } from "./lazy-courier-map";

import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/i18n/use-format";
// Rounded public positions are within about 110 m; the circle says so on the map.
const APPROXIMATE_RADIUS_M = 110;

type Location = { lat: number; lng: number; updatedAt: string; exact?: boolean; accuracy?: number };

// Re-renders every 30 seconds so "updated x min ago" stays honest between updates.
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function CourierLocationCard({ location, title }: { location: Location; title?: string }) {
  const t = useTranslations("maps");
  const f = useFormat();
  const now = useNow();
  const exact = location.exact === true;
  const markers = useMemo<MapMarker[]>(() => [{
    id: "courier",
    lat: location.lat,
    lng: location.lng,
    label: exact ? t("courierSCurrentPosition") : t("courierSApproximatePosition"),
    approximateRadiusM: exact ? undefined : APPROXIMATE_RADIUS_M,
  }], [location.lat, location.lng, exact]);
  const age = f.age(location.updatedAt, now);

  return (
    <Card data-testid="courier-location">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Navigation className="size-5" aria-hidden="true" />{title ?? t("courierLocation")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* The text says everything the map shows, so the map is never the only source. */}
        <p className="text-sm" role="status">
          {exact
            ? (location.accuracy
              ? t.rich("sharedAccurate", { b: (chunks) => <strong>{chunks}</strong>, age, meters: f.digits(Math.round(location.accuracy)) })
              : t.rich("shared", { b: (chunks) => <strong>{chunks}</strong>, age }))
            : t.rich("approximate", { b: (chunks) => <strong>{chunks}</strong>, age })}
        </p>
        <CourierMap markers={markers} label={exact ? t("mapOfTheCourier") : t("mapOfTheCourier2")} />
        {!exact && <p className="text-xs text-muted-foreground">{t("shownToWithinAbout")}</p>}
      </CardContent>
    </Card>
  );
}
