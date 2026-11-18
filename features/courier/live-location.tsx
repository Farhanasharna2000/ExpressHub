"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, LocateFixed, MapPinOff, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/features/auth/provider";
import { useResource } from "@/features/shipments/use-resource";
import { ApiError, errorMessage, isCancelled } from "@/lib/client/api";
import { shouldSendLocation } from "@/lib/courier-location";
import { MAX_LOCATION_ACCURACY_M } from "@/validators/courier-location";

type SharingState = "off" | "starting" | "sharing" | "denied" | "unavailable";

type LiveLocation = {
  state: SharingState;
  canShare: boolean;
  message: string | null;
  lastSentAt: number | null;
  start: () => void;
  stop: () => void;
};

const Context = createContext<LiveLocation | null>(null);
const STATS_POLL_MS = 60_000;

export function useLiveLocation() {
  const value = useContext(Context);
  if (!value) throw new Error("useLiveLocation must be used inside LiveLocationProvider");
  return value;
}

// Lives in the courier layout, so sharing keeps going while the courier moves between
// courier pages. It stops when the courier turns it off, leaves the courier app, the
// permission is refused, or no delivery is out any more (checked here and by the API).
export function LiveLocationProvider({ children }: { children: ReactNode }) {
  const { store } = useSession();
  const stats = useResource<{ byStatus: Record<string, number> }>("/courier/stats");
  const canShare = (stats.data?.byStatus.OUT_FOR_DELIVERY ?? 0) > 0;
  const [state, setState] = useState<SharingState>("off");
  const [message, setMessage] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const watchId = useRef<number | null>(null);
  const last = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const sending = useRef(false);

  const { reload: reloadStats } = stats;
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") reloadStats(); }, STATS_POLL_MS);
    return () => clearInterval(timer);
  }, [reloadStats]);

  const clearWatch = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    last.current = null;
  }, []);

  const stop = useCallback((notice?: string) => {
    const wasSharing = watchId.current !== null;
    clearWatch();
    setState("off");
    setMessage(notice ?? null);
    if (wasSharing) store.api.request("/courier/location", { method: "DELETE" }).catch(() => { /* Stale positions expire on their own. */ });
  }, [clearWatch, store]);

  const send = useCallback(async (position: GeolocationPosition) => {
    const { latitude, longitude, accuracy, heading, speed } = position.coords;
    if (accuracy > MAX_LOCATION_ACCURACY_M) {
      setMessage("Waiting for a more accurate location…");
      return;
    }
    const now = Date.now();
    const next = { lat: latitude, lng: longitude };
    if (sending.current || !shouldSendLocation(last.current, next, now)) return;
    sending.current = true;
    try {
      await store.api.request("/courier/location", {
        method: "POST",
        body: {
          lat: latitude,
          lng: longitude,
          accuracy,
          heading: heading !== null && Number.isFinite(heading) ? heading : null,
          speed: speed !== null && Number.isFinite(speed) ? speed : null,
        },
      });
      last.current = { ...next, at: now };
      setLastSentAt(now);
      setState("sharing");
      setMessage(null);
    } catch (error) {
      if (isCancelled(error)) return;
      if (error instanceof ApiError && error.status === 409) {
        stop("You have no deliveries out, so location sharing has stopped.");
        void reloadStats();
        return;
      }
      // Keep watching: the next fix retries. The courier sees why nothing is updating.
      setMessage(`Location not sent: ${errorMessage(error)}`);
    } finally {
      sending.current = false;
    }
  }, [store, stop, reloadStats]);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState("unavailable");
      setMessage("This device cannot share its location.");
      return;
    }
    clearWatch();
    setState("starting");
    setMessage(null);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => { void send(position); },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          clearWatch();
          setState("denied");
          setMessage("Location permission was refused. Allow location for this site in your browser settings, then try again.");
        } else {
          setMessage(error.code === error.TIMEOUT ? "Still looking for your location…" : "Your location is unavailable right now. We will keep trying.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
  }, [clearWatch, send]);

  // Nothing out for delivery any more: stop instead of sending positions the API rejects.
  useEffect(() => {
    if (!canShare && stats.data && watchId.current !== null) stop("All your deliveries are done, so location sharing has stopped.");
  }, [canShare, stats.data, stop]);

  // Leaving the courier app stops sharing.
  const stopRef = useRef(stop);
  useEffect(() => { stopRef.current = stop; }, [stop]);
  useEffect(() => () => stopRef.current(), []);

  const value = useMemo<LiveLocation>(() => ({ state, canShare, message, lastSentAt, start, stop: () => stop() }), [state, canShare, message, lastSentAt, start, stop]);
  return (
    <Context.Provider value={value}>
      <LiveLocationBanner />
      {children}
    </Context.Provider>
  );
}

// Visible on every courier page while sharing, with a one-tap stop.
function LiveLocationBanner() {
  const { state, stop } = useLiveLocation();
  if (state !== "sharing" && state !== "starting") return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
      <span className="flex items-center gap-2 font-medium text-primary">
        {state === "starting" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Navigation className="size-4 animate-pulse" aria-hidden="true" />}
        {state === "starting" ? "Starting live location…" : "Sharing live location"}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={stop}>Stop sharing</Button>
    </div>
  );
}

// The opt-in control, shown on the delivery screen and dashboard while a delivery is out.
export function LiveLocationToggle() {
  const { state, canShare, message, lastSentAt, start, stop } = useLiveLocation();
  if (!canShare && state === "off" && !message) return null;
  const active = state === "sharing" || state === "starting";
  return (
    <Card data-testid="live-location-toggle">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><LocateFixed className="size-5" aria-hidden="true" />Live location</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          While you have a delivery out, customers can follow your approximate position on their tracking page, rounded to about 100 m.
          Only your latest position is kept, and it is removed when your deliveries are done.
        </p>
        {active ? (
          <Button type="button" variant="outline" onClick={stop}><MapPinOff aria-hidden="true" /> Stop sharing my location</Button>
        ) : (
          <Button type="button" onClick={start} disabled={!canShare}><Navigation aria-hidden="true" /> Share my live location</Button>
        )}
        {state === "sharing" && lastSentAt && <p className="text-xs text-muted-foreground">Last sent at {new Date(lastSentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.</p>}
        {message && <p role="alert" className={state === "denied" || state === "unavailable" ? "text-destructive" : "text-amber-800"}>{message}</p>}
      </CardContent>
    </Card>
  );
}
