"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_TIME_ZONE } from "./contracts";

const subscribe = () => () => {};

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

// Hydration uses the server snapshot (Dhaka), so the first client render matches the
// server HTML; React then re-renders with the visitor's own timezone.
export function useViewerTimeZone() {
  return useSyncExternalStore(subscribe, deviceTimeZone, () => DEFAULT_TIME_ZONE);
}
