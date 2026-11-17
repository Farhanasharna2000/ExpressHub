"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Clock3, MapPin, Package, Radio, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/primitives";
import type { ShipmentStatus } from "@/types/api";
import { FINAL_STATUSES, eventTitle, reconnectDelay, trackingStatusLabel, trackingTime, type PublicTracking } from "./contracts";
import { TrackForm } from "./track-form";

type Connection = "connecting" | "live" | "reconnecting" | "ended";

const JOURNEY = ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export function TrackingView({ initial }: { initial: PublicTracking }) {
  const [tracking, setTracking] = useState(initial);
  const [connection, setConnection] = useState<Connection>(FINAL_STATUSES.has(initial.status) ? "ended" : "connecting");
  const [announcement, setAnnouncement] = useState("");
  const lastStatus = useRef(initial.status);

  useEffect(() => {
    if (FINAL_STATUSES.has(initial.status)) return;
    const url = `/api/v1/track/${encodeURIComponent(initial.trackingNumber)}/stream`;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const reconnect = () => {
      source?.close();
      source = null;
      if (stopped) return;
      setConnection("reconnecting");
      timer = setTimeout(connect, reconnectDelay(attempt++));
    };

    function connect() {
      if (stopped) return;
      source = new EventSource(url);
      source.addEventListener("open", () => {
        attempt = 0;
        setConnection("live");
      });
      source.addEventListener("tracking", (event) => {
        const next = JSON.parse((event as MessageEvent<string>).data) as PublicTracking;
        setTracking(next);
        if (next.status !== lastStatus.current) {
          lastStatus.current = next.status;
          setAnnouncement(`Status updated: ${trackingStatusLabel(next.status)}`);
        }
      });
      source.addEventListener("end", (event) => {
        const { reason } = JSON.parse((event as MessageEvent<string>).data) as { reason: string };
        if (reason === "final" || reason === "gone") {
          stopped = true;
          source?.close();
          setConnection("ended");
          return;
        }
        reconnect();
      });
      // While CONNECTING the browser retries by itself; a CLOSED source (for
      // example an HTTP 429) needs our own retry with backoff.
      source.addEventListener("error", () => {
        if (source?.readyState === EventSource.CLOSED) reconnect();
        else setConnection("reconnecting");
      });
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [initial.trackingNumber, initial.status]);

  const events = [...tracking.events].reverse();
  const journeyIndex = JOURNEY.indexOf(tracking.status as (typeof JOURNEY)[number]);
  const offPath = journeyIndex === -1;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Public tracking</p>
          <h1>Track your parcel</h1>
          <p className="break-all font-mono text-sm">{tracking.trackingNumber}</p>
        </div>
        <ConnectionBadge connection={connection} />
      </div>

      <p className="sr-only" aria-live="polite" role="status">{announcement}</p>

      <Card>
        <CardHeader className="border-b pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Package className="size-5" aria-hidden="true" /></span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Current status</p>
                <p className="text-xl font-semibold">{trackingStatusLabel(tracking.status)}</p>
              </div>
            </div>
            <StatusBadge status={tracking.status as ShipmentStatus} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          {offPath ? (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {tracking.status === "FAILED"
                ? "The last delivery attempt did not succeed. The courier team will arrange the next step."
                : `This shipment is ${trackingStatusLabel(tracking.status).toLowerCase()}.`}
            </p>
          ) : (
            <ol className="grid grid-cols-5 gap-2" aria-label="Delivery progress">
              {JOURNEY.map((step, index) => {
                const done = index <= journeyIndex;
                return (
                  <li key={step} className="flex flex-col items-center gap-1 text-center text-xs" aria-current={index === journeyIndex ? "step" : undefined}>
                    {done ? <CheckCircle2 className="size-5 text-primary" aria-hidden="true" /> : <Circle className="size-5 text-muted-foreground" aria-hidden="true" />}
                    <span className={done ? "font-medium" : "text-muted-foreground"}>{trackingStatusLabel(step)}</span>
                    <span className="sr-only">{done ? "completed" : "not yet"}</span>
                  </li>
                );
              })}
            </ol>
          )}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Booked</dt><dd><time dateTime={tracking.createdAt}>{trackingTime(tracking.createdAt)}</time></dd></div>
            {tracking.deliveredAt && <div><dt className="text-xs text-muted-foreground">Delivered</dt><dd><time dateTime={tracking.deliveredAt}>{trackingTime(tracking.deliveredAt)}</time></dd></div>}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="size-5" aria-hidden="true" />Tracking history</CardTitle></CardHeader>
        <CardContent>
          {events.length ? (
            <ol className="shipment-timeline">
              {events.map((event, index) => (
                <li key={`${event.occurredAt}-${event.type}-${index}`} aria-current={index === 0 ? "step" : undefined}>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-base font-semibold">{eventTitle(event)}</h2>
                    {index === 0 && <span className="text-xs font-medium text-primary">Latest</span>}
                  </div>
                  <time className="text-sm text-muted-foreground" dateTime={event.occurredAt}>{trackingTime(event.occurredAt)}</time>
                  {event.hub && <p className="flex items-center gap-1 text-sm"><MapPin className="size-3.5" aria-hidden="true" />{event.hub}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Updates will appear here as your parcel moves.</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Times are shown in Bangladesh time (GMT+6).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Track another parcel</CardTitle></CardHeader>
        <CardContent><TrackForm /></CardContent>
      </Card>
    </div>
  );
}

function ConnectionBadge({ connection }: { connection: Connection }) {
  const text = { connecting: "Connecting…", live: "Live updates on", reconnecting: "Reconnecting…", ended: "Final status" }[connection];
  const tone = connection === "live" ? "text-primary" : connection === "reconnecting" ? "text-amber-700" : "text-muted-foreground";
  return (
    <p role="status" className={`flex items-center gap-2 text-sm font-medium ${tone}`}>
      <Radio className={`size-4 ${connection === "live" ? "animate-pulse" : ""}`} aria-hidden="true" />
      {text}
    </p>
  );
}
