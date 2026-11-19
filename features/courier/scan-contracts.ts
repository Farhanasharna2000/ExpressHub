import { parseTrackingInput } from "@/features/tracking/contracts";

// A label's QR code holds the public tracking link; people also type or paste the bare
// number. Both resolve to the tracking number, and anything else is not a parcel.
export const trackingNumberFromScan = (value: string) => parseTrackingInput(value);

export const courierLookupPath = (trackingNumber: string) =>
  `/courier/shipments/by-tracking/${encodeURIComponent(trackingNumber)}`;

// Decoding every animation frame is wasteful on phones; about 8 attempts a second is enough.
export const SCAN_INTERVAL_MS = 125;
