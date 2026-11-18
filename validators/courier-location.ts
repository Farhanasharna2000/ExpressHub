import { z } from "zod";

// Fixes worse than this are too vague to show anyone; the courier app waits for a better one.
export const MAX_LOCATION_ACCURACY_M = 1_000;
// 100 m/s is far beyond any delivery vehicle; anything higher is a bad reading.
const MAX_SPEED_MS = 100;

export const courierLocationSchema = z.strictObject({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(MAX_LOCATION_ACCURACY_M, `Location accuracy must be within ${MAX_LOCATION_ACCURACY_M} m`),
  heading: z.number().finite().min(0).max(360).nullable().optional(),
  speed: z.number().finite().min(0).max(MAX_SPEED_MS).nullable().optional(),
});

export type CourierLocationInput = z.infer<typeof courierLocationSchema>;
