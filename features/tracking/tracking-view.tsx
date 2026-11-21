"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, useGSAP, whenMotionAllowed } from "@/lib/gsap";
import { CheckCircle2, Circle, Clock3, MapPin, Package, Radio, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { useAppLocale } from "@/lib/i18n/use-format";
import { FINAL_STATUSES, additionalUpdates, journeyProgress, journeyStepTimes, reconnectDelay, timeZoneLabel, trackingShortTime, trackingTime, type PublicTracking, type PublicTrackingEvent } from "./contracts";
import { useViewerTimeZone } from "./use-time-zone";
import { TrackForm } from "./track-form";
import { CourierLocationCard } from "@/features/maps/courier-location-card";

type Connection = "connecting" | "live" | "reconnecting" | "ended";

const JOURNEY = ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export function TrackingView({ initial }: { initial: PublicTracking }) {
  const [tracking, setTracking] = useState(initial);
  const [connection, setConnection] = useState<Connection>(FINAL_STATUSES.has(initial.status) ? "ended" : "connecting");
  const [announcement, setAnnouncement] = useState("");
  const t = useTranslations("tracking");
  const locale = useAppLocale();
  const statusText = (status: string) => t(`status.${status as (typeof JOURNEY)[number] | "FAILED" | "RETURNED" | "CANCELLED"}`);
  const statusMessage = (status: string) => t(`message.${status as (typeof JOURNEY)[number] | "FAILED" | "RETURNED" | "CANCELLED"}`);
  const eventText = (event: Pick<PublicTrackingEvent, "type" | "status">) =>
    event.type === "HUB_TRANSFER" || event.type === "DELIVERY_ATTEMPT" || event.type === "CUSTOMER_CANCELLED"
      ? t(`event.${event.type}`)
      : event.status ? statusText(event.status) : t("event.updated");
  const lastStatus = useRef(initial.status);
  const timeZone = useViewerTimeZone();

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
          setAnnouncement(t("statusUpdated", { status: statusText(next.status) }));
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
  const progress = journeyProgress(journeyIndex, JOURNEY.length);
  const scope = useRef<HTMLDivElement>(null);
  useTrackingAnimations(scope, journeyIndex, tracking.events.length);

  const stepTimes = journeyStepTimes(tracking, JOURNEY);
  // With the progress steps on screen, list only what they cannot show; otherwise everything.
  const historyEvents = offPath ? events : additionalUpdates(tracking.events, JOURNEY).reverse();

  return (
    <div className="page-stack" ref={scope}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("trackingNumber")} <span className="break-all font-mono text-foreground">{tracking.trackingNumber}</span>
          </p>
        </div>
      </div>

      <p className="sr-only" aria-live="polite" role="status">{announcement}</p>

      <Card>
        <CardHeader className="border-b pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Package className="size-5" aria-hidden="true" /></span>
              <div className="space-y-1">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("currentStatus")}</p>
                <h2 data-anim="status" className="origin-left font-semibold">{statusText(tracking.status)}</h2>
                {!offPath && <p className="text-sm text-muted-foreground">{statusMessage(tracking.status)}</p>}
              </div>
            </div>
            <ConnectionBadge connection={connection} />
          </div>
        </CardHeader>
        <CardContent>
          {offPath ? (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {statusMessage(tracking.status) || t("offPathFallback", { status: statusText(tracking.status) })}
            </p>
          ) : (
            <div className="relative">
              <div className="tracking-progress" aria-hidden="true">
                <div className="tracking-progress-fill" style={{ transform: `scaleX(${progress})` }} />
              </div>
              <ol className="relative grid grid-cols-5 gap-2" aria-label={t("deliveryProgress")}>
                {JOURNEY.map((step, index) => {
                  const done = index <= journeyIndex;
                  const current = index === journeyIndex;
                  const reachedAt = done ? stepTimes[step] : undefined;
                  return (
                    <li key={step} data-anim="step" className="flex flex-col items-center gap-1 text-center text-xs" aria-current={current ? "step" : undefined}>
                      {done ? <CheckCircle2 className="size-5 rounded-full bg-card text-primary" aria-hidden="true" /> : <Circle className="size-5 rounded-full bg-card text-muted-foreground" aria-hidden="true" />}
                      <span className={current ? "font-semibold text-ink" : done ? "font-medium" : "text-muted-foreground"}>{statusText(step)}</span>
                      {reachedAt ? (
                        <time className="text-[11px] leading-tight text-muted-foreground" dateTime={reachedAt} title={trackingTime(reachedAt, timeZone, locale)}>{trackingShortTime(reachedAt, timeZone, locale)}</time>
                      ) : (
                        <span className="sr-only">{t("notYet")}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <p className="mt-5 text-center text-xs text-muted-foreground">{t("timeZoneNote", { zone: timeZoneLabel(timeZone, new Date(), locale) })}</p>
        </CardContent>
      </Card>

      {tracking.courierLocation && <CourierLocationCard location={tracking.courierLocation} />}

      {historyEvents.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="size-5" aria-hidden="true" />{offPath ? t("trackingHistory") : t("otherUpdates")}</CardTitle></CardHeader>
          <CardContent>
            <ol className="shipment-timeline">
              {historyEvents.map((event, index) => (
                <li key={`${event.occurredAt}-${event.type}-${index}`}>
                  <h3 className="text-base font-semibold">{eventText(event)}</h3>
                  <time className="text-sm text-muted-foreground" dateTime={event.occurredAt}>{trackingTime(event.occurredAt, timeZone, locale)}</time>
                  {event.hub && <p className="flex items-center gap-1 text-sm"><MapPin className="size-3.5" aria-hidden="true" />{event.hub}</p>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{t("trackAnother")}</CardTitle></CardHeader>
        <CardContent><TrackForm /></CardContent>
      </Card>
    </div>
  );
}

// The first render plays an entrance; later renders animate only what changed: the
// progress line grows to the new step and the newest history entry slides in. React has
// already put the new status text in the DOM, so nothing waits on an animation.
function useTrackingAnimations(scope: React.RefObject<HTMLDivElement | null>, journeyIndex: number, eventCount: number) {
  const previous = useRef<{ index: number; count: number } | null>(null);
  useGSAP(() => {
    const before = previous.current;
    previous.current = { index: journeyIndex, count: eventCount };
    const fill = scope.current?.querySelector(".tracking-progress-fill");
    const to = journeyProgress(journeyIndex, JOURNEY.length);
    whenMotionAllowed(() => {
      if (!before) {
        const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
        intro.fromTo("[data-anim=step]", { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.08, duration: 0.45, clearProps: "opacity,transform" });
        if (fill) intro.fromTo(fill, { scaleX: 0 }, { scaleX: to, duration: 0.9, ease: "power2.inOut" }, 0.15);
        intro.fromTo(".shipment-timeline > li", { opacity: 0, x: -12 }, { opacity: 1, x: 0, stagger: 0.07, duration: 0.45, clearProps: "opacity,transform" }, 0.2);
        return;
      }
      if (fill && before.index !== journeyIndex) {
        gsap.fromTo(fill, { scaleX: journeyProgress(before.index, JOURNEY.length) }, { scaleX: to, duration: 0.7, ease: "power2.inOut" });
      }
      if (eventCount > before.count) {
        gsap.fromTo(".shipment-timeline > li:first-child", { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 0.5, clearProps: "opacity,transform" });
        gsap.fromTo("[data-anim=status]", { scale: 1.15 }, { scale: 1, duration: 0.6, ease: "back.out(3)", clearProps: "transform" });
      }
    });
    // Reset on unmount (and React Strict Mode's simulated one) so the entrance replays.
    return () => { previous.current = null; };
  }, { scope, dependencies: [journeyIndex, eventCount] });
}

function ConnectionBadge({ connection }: { connection: Connection }) {
  const t = useTranslations("tracking.connection");
  const text = t(connection);
  const tone = connection === "live" ? "text-primary" : connection === "reconnecting" ? "text-amber-700" : "text-muted-foreground";
  return (
    <p role="status" className={`flex items-center gap-2 text-sm font-medium ${tone}`}>
      <Radio className={`size-4 ${connection === "live" ? "animate-pulse" : ""}`} aria-hidden="true" />
      {text}
    </p>
  );
}
