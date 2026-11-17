import "server-only";

import prisma from "@/lib/prisma";
import { toPublicTracking } from "@/services/tracking-stream";
import { PUBLIC_EVENT_TYPES, type PublicTracking } from "@/validators/track";

const MAX_PUBLIC_EVENTS = 50;
const hub = { select: { name: true } } as const;

// Public lookup by tracking number. Selects only the fields the public shape
// allows; soft-deleted shipments are treated as unknown.
export async function getPublicTracking(trackingNumber: string): Promise<PublicTracking | null> {
  const row = await prisma.shipment.findFirst({
    where: { trackingNumber, deletedAt: null },
    select: {
      trackingNumber: true,
      status: true,
      createdAt: true,
      deliveredAt: true,
      events: {
        where: { type: { in: [...PUBLIC_EVENT_TYPES] } },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: MAX_PUBLIC_EVENTS,
        select: { type: true, toStatus: true, occurredAt: true, originHub: hub, destinationHub: hub },
      },
    },
  });
  // Newest events are fetched so a long history keeps its latest steps, then shown oldest first.
  return row ? toPublicTracking({ ...row, events: row.events.reverse() }) : null;
}
