"use client";

import { useEffect, useMemo, useState } from "react";
import { Navigation } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { locationAge } from "@/lib/courier-location";
import { CourierMap, type MapMarker } from "./lazy-courier-map";

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

export function CourierLocationCard({ location, title = "Courier location" }: { location: Location; title?: string }) {
  const now = useNow();
  const exact = location.exact === true;
  const markers = useMemo<MapMarker[]>(() => [{
    id: "courier",
    lat: location.lat,
    lng: location.lng,
    label: exact ? "Courier's current position" : "Courier's approximate position",
    approximateRadiusM: exact ? undefined : APPROXIMATE_RADIUS_M,
  }], [location.lat, location.lng, exact]);
  const age = locationAge(location.updatedAt, now);

  return (
    <Card data-testid="courier-location">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Navigation className="size-5" aria-hidden="true" />{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* The text says everything the map shows, so the map is never the only source. */}
        <p className="text-sm" role="status">
          {exact
            ? <>The courier shared their position <strong>{age}</strong>{location.accuracy ? `, accurate to about ${Math.round(location.accuracy)} m` : ""}.</>
            : <>Your parcel is out for delivery. The courier&apos;s approximate position was updated <strong>{age}</strong>.</>}
        </p>
        <CourierMap markers={markers} label={exact ? "Map of the courier's current position" : "Map of the courier's approximate position"} />
        {!exact && <p className="text-xs text-muted-foreground">Shown to within about 100 m while your parcel is out for delivery.</p>}
      </CardContent>
    </Card>
  );
}
