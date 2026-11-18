// Rules for live courier locations, shared by the courier app, the API and the maps.

// A position older than this is not shown anywhere: the courier stopped sharing,
// closed the app or lost signal.
export const LOCATION_STALE_MS = 10 * 60 * 1000;
// The courier app sends at most one update per interval, or sooner after real movement,
// but never more often than the minimum gap.
export const LOCATION_SEND_INTERVAL_MS = 15_000;
export const LOCATION_MIN_GAP_MS = 3_000;
export const LOCATION_SEND_DISTANCE_M = 50;
// Public views show 3 decimal places, about 110 m, so a parcel's map never pinpoints
// a courier or a doorstep.
const PUBLIC_DECIMALS = 3;

export type LatLng = { lat: number; lng: number };
export type PublicCourierLocation = { lat: number; lng: number; updatedAt: string };
export type StoredLocation = { latitude: number; longitude: number; updatedAt: Date };

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

// Great-circle distance in metres (haversine).
export function distanceMeters(a: LatLng, b: LatLng) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function shouldSendLocation(last: (LatLng & { at: number }) | null, next: LatLng, now: number) {
  if (!last) return true;
  const elapsed = now - last.at;
  if (elapsed < LOCATION_MIN_GAP_MS) return false;
  return elapsed >= LOCATION_SEND_INTERVAL_MS || distanceMeters(last, next) > LOCATION_SEND_DISTANCE_M;
}

export const roundForPublic = (value: number) => {
  const factor = 10 ** PUBLIC_DECIMALS;
  // Normalises -0 to 0 so the JSON never carries "-0".
  return Math.round(value * factor) / factor + 0;
};

export function isFreshLocation(updatedAt: Date | string, now = Date.now()) {
  const at = typeof updatedAt === "string" ? Date.parse(updatedAt) : updatedAt.getTime();
  return Number.isFinite(at) && now - at <= LOCATION_STALE_MS && at - now <= 60_000;
}

// What a customer or anyone with the tracking link may see: only while the shipment is
// out for delivery with an assigned courier and a fresh position, rounded, and without
// accuracy, heading, speed or who the courier is.
export function publicCourierLocation(
  shipment: { status: string; hasCourier: boolean },
  location: StoredLocation | null | undefined,
  now = Date.now(),
): PublicCourierLocation | null {
  if (shipment.status !== "OUT_FOR_DELIVERY" || !shipment.hasCourier || !location) return null;
  if (!isFreshLocation(location.updatedAt, now)) return null;
  return {
    lat: roundForPublic(location.latitude),
    lng: roundForPublic(location.longitude),
    updatedAt: location.updatedAt.toISOString(),
  };
}

export function locationAge(updatedAt: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(updatedAt)) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
}
