"use client";

import { useEffect } from "react";
import { useResource } from "@/features/shipments/use-resource";
import { CourierLocationCard } from "./courier-location-card";

export const LOCATION_POLL_MS = 15_000;

type Location = { lat: number; lng: number; updatedAt: string; exact: boolean; accuracy?: number };

// Polls the reload function while enabled; paused while the tab is hidden.
export function usePolling(reload: () => void, intervalMs: number, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [reload, intervalMs, enabled]);
}

// The courier's position on a shipment detail page. The API decides precision: exact
// for admins, rounded for the customer, nothing unless the shipment is out for delivery.
export function ShipmentCourierMap({ shipmentId, status }: { shipmentId: string; status: string }) {
  const active = status === "OUT_FOR_DELIVERY";
  const { data, reload } = useResource<{ location: Location | null }>(active ? `/shipments/${encodeURIComponent(shipmentId)}/courier-location` : null);
  usePolling(reload, LOCATION_POLL_MS, active);
  if (!active || !data?.location) return null;
  return <CourierLocationCard location={data.location} title={data.location.exact ? "Courier's live location" : "Courier location"} />;
}
