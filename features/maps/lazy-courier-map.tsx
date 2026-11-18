"use client";

import dynamic from "next/dynamic";

// Leaflet touches window on import, so the map only ever loads in the browser, and only
// on pages that show one.
export const CourierMap = dynamic(() => import("./courier-map"), {
  ssr: false,
  loading: () => <div className="courier-map animate-pulse" aria-hidden="true" />,
});

export type { MapMarker } from "./courier-map";
