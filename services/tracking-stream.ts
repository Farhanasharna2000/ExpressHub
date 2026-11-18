import { publicCourierLocation, type StoredLocation } from "@/lib/courier-location";
import { publicTrackingSchema, type PublicTracking } from "@/validators/track";

export const TERMINAL_STATUSES = new Set(["DELIVERED", "RETURNED", "CANCELLED"]);

type HubRef = { name: string } | null;

export type TrackingRow = {
  trackingNumber: string;
  status: string;
  createdAt: Date;
  deliveredAt: Date | null;
  events: Array<{
    type: string;
    toStatus: string | null;
    occurredAt: Date;
    originHub: HubRef;
    destinationHub: HubRef;
  }>;
  hasCourier?: boolean;
  courierLocation?: StoredLocation | null;
};

// Maps a database row to the public shape and validates it, so a field added to
// the query by mistake fails loudly here instead of reaching an anonymous caller.
export function toPublicTracking(row: TrackingRow, now = Date.now()): PublicTracking {
  return publicTrackingSchema.parse({
    trackingNumber: row.trackingNumber,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    events: row.events.map((event) => ({
      type: event.type,
      status: event.toStatus,
      occurredAt: event.occurredAt.toISOString(),
      hub: (event.type === "HUB_TRANSFER" ? event.destinationHub : event.destinationHub ?? event.originHub)?.name ?? null,
    })),
    courierLocation: publicCourierLocation({ status: row.status, hasCourier: row.hasCourier ?? false }, row.courierLocation, now),
  });
}

// Changes when the timeline or the courier's public position changes (including the
// position appearing or going stale), so the stream pushes exactly those updates.
export function trackingSignature(tracking: PublicTracking) {
  const last = tracking.events.at(-1);
  const location = tracking.courierLocation;
  const where = location ? `${location.lat},${location.lng},${location.updatedAt}` : "-";
  return `${tracking.status}|${tracking.events.length}|${last?.occurredAt ?? ""}|${last?.type ?? ""}|${where}`;
}

export type TrackingStreamOptions = {
  initial: PublicTracking;
  load: () => Promise<PublicTracking | null>;
  pollMs?: number;
  heartbeatMs?: number;
  lifetimeMs?: number;
  maxConsecutiveErrors?: number;
  signal?: AbortSignal;
};

export const STREAM_POLL_MS = 5_000;
export const STREAM_HEARTBEAT_MS = 25_000;
// Vercel caps a function at 300 seconds, so the stream ends before that and the
// browser reconnects with the retry hint below.
export const STREAM_LIFETIME_MS = 270_000;
export const STREAM_RETRY_MS = 3_000;

const encoder = new TextEncoder();
const frame = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

// Server-Sent Events: the current state on connect, then a new frame only when the
// shipment's timeline changes. It ends on a final status, a removed shipment,
// repeated load errors, the lifetime limit or a client disconnect.
export function createTrackingStream(options: TrackingStreamOptions) {
  const pollMs = options.pollMs ?? STREAM_POLL_MS;
  const heartbeatMs = options.heartbeatMs ?? STREAM_HEARTBEAT_MS;
  const lifetimeMs = options.lifetimeMs ?? STREAM_LIFETIME_MS;
  const maxErrors = options.maxConsecutiveErrors ?? 3;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let lifetimeTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let cleanup = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let signature = trackingSignature(options.initial);
      let errors = 0;

      const close = (reason?: string) => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          if (reason) controller.enqueue(frame("end", { reason }));
          controller.close();
        } catch { /* The client already went away. */ }
      };
      cleanup = () => {
        clearTimeout(pollTimer);
        clearInterval(heartbeatTimer);
        clearTimeout(lifetimeTimer);
        options.signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => close();

      const poll = async () => {
        if (closed) return;
        try {
          const next = await options.load();
          if (closed) return;
          errors = 0;
          if (!next) return close("gone");
          const nextSignature = trackingSignature(next);
          if (nextSignature !== signature) {
            signature = nextSignature;
            controller.enqueue(frame("tracking", next));
          }
          if (TERMINAL_STATUSES.has(next.status)) return close("final");
        } catch (error) {
          console.error("Tracking stream poll failed", error instanceof Error ? error.message : error);
          errors += 1;
          if (errors >= maxErrors) return close("error");
        }
        pollTimer = setTimeout(poll, pollMs);
      };

      controller.enqueue(encoder.encode(`retry: ${STREAM_RETRY_MS}\n\n`));
      controller.enqueue(frame("tracking", options.initial));
      if (options.signal?.aborted) return close();
      options.signal?.addEventListener("abort", onAbort);
      if (TERMINAL_STATUSES.has(options.initial.status)) return close("final");
      heartbeatTimer = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { close(); }
      }, heartbeatMs);
      lifetimeTimer = setTimeout(() => close("timeout"), lifetimeMs);
      pollTimer = setTimeout(poll, pollMs);
    },
    cancel() {
      closed = true;
      cleanup();
    },
  });
}
