import { timingSafeEqual } from "node:crypto";

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Short or missing secrets never match.
export function hasCronSecret(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 16 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
