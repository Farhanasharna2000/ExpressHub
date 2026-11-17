import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackingView } from "@/features/tracking/tracking-view";
import { getPublicTracking } from "@/services/tracking.service";
import { trackingNumberSchema } from "@/validators/track";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ trackingNumber: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const parsed = trackingNumberSchema.safeParse((await params).trackingNumber);
  return {
    title: parsed.success ? `Tracking ${parsed.data}` : "Track a parcel",
    description: "Live delivery status for an ExpressHub parcel.",
    robots: { index: false, follow: false },
  };
}

export default async function TrackingPage({ params }: Props) {
  // The root loading boundary streams every page, so lower-case input is
  // normalised in place rather than redirected; the API carries real 404s.
  const parsed = trackingNumberSchema.safeParse((await params).trackingNumber);
  if (!parsed.success) notFound();
  const tracking = await getPublicTracking(parsed.data);
  if (!tracking) notFound();
  return <TrackingView initial={tracking} />;
}
