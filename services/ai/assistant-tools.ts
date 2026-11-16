import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AuthenticatedUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/errors";
import type { ShipmentStatus } from "@/types/api";

const SHIPMENT_STATUSES = [
  "CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED", "CANCELLED",
] as const satisfies readonly ShipmentStatus[];

type Amount = { toString(): string } | string | number;

export type AssistantShipment = {
  id: string;
  trackingNumber: string;
  status: string;
  paymentStatus: string;
  price: Amount;
  currency: string;
  pickupContactName: string;
  pickupAddress: string;
  deliveryContactName: string;
  deliveryAddress: string;
  packageDescription: string | null;
  parcelWeightKg: Amount;
  courierId: string | null;
  pickupScheduledAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type AssistantShipmentEvent = {
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  publicNote: string | null;
  occurredAt: Date;
};
export type AssistantPayment = {
  id: string;
  amount: Amount;
  currency: string;
  status: string;
  paidAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
};

// Every lookup runs as the signed-in actor through the existing services, which
// already scope records by role and ownership. Tools never accept a user id.
export interface AssistantToolServices {
  findShipments(actor: AuthenticatedUser, filter: { query?: string; status?: ShipmentStatus }): Promise<AssistantShipment[]>;
  getShipment(actor: AuthenticatedUser, id: string): Promise<AssistantShipment & { events: AssistantShipmentEvent[] }>;
  listShipmentPayments(actor: AuthenticatedUser, shipmentId: string): Promise<AssistantPayment[]>;
}

export const ASSISTANT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "find_shipments",
    description: "Search the signed-in user's shipments by tracking number, contact name or address, optionally filtered by status. Returns up to 10 shipments, newest first, with their ids. Use an empty query and status ANY to list recent shipments.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 100, description: "Tracking number, name or address text. Empty string for no text filter." },
        status: { type: "string", enum: [...SHIPMENT_STATUSES, "ANY"], description: "Shipment status filter, or ANY." },
      },
      required: ["query", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "get_shipment",
    description: "Get one shipment by its id (from find_shipments), including its status timeline. Use it to explain where a parcel is or why a delivery failed.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { shipment_id: { type: "string", description: "Shipment id returned by find_shipments." } },
      required: ["shipment_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_shipment_payments",
    description: "List the payments for one of the customer's shipments by shipment id. Customers only.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { shipment_id: { type: "string", description: "Shipment id returned by find_shipments." } },
      required: ["shipment_id"],
      additionalProperties: false,
    },
  },
];

const findInput = z.object({
  query: z.string().trim().max(100),
  status: z.enum([...SHIPMENT_STATUSES, "ANY"]),
}).strict();
const shipmentInput = z.object({ shipment_id: z.cuid() }).strict();

export type ShipmentRef = { id: string; trackingNumber: string };
export type ToolOutcome = { content: string; isError: boolean; shipmentId?: string; shipments?: ShipmentRef[] };

const iso = (value: Date | null) => (value ? value.toISOString() : null);

export function shipmentSummary(shipment: AssistantShipment) {
  return {
    id: shipment.id,
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    paymentStatus: shipment.paymentStatus,
    price: `${shipment.price.toString()} ${shipment.currency}`,
    from: { name: shipment.pickupContactName, address: shipment.pickupAddress },
    to: { name: shipment.deliveryContactName, address: shipment.deliveryAddress },
    packageDescription: shipment.packageDescription,
    weightKg: shipment.parcelWeightKg.toString(),
    courierAssigned: Boolean(shipment.courierId),
    pickupScheduledAt: iso(shipment.pickupScheduledAt),
    deliveredAt: iso(shipment.deliveredAt),
    createdAt: iso(shipment.createdAt),
    updatedAt: iso(shipment.updatedAt),
  };
}

const failure = (content: string, shipmentId?: string): ToolOutcome => ({ content, isError: true, shipmentId });

export async function executeAssistantTool(
  actor: AuthenticatedUser,
  name: string,
  input: unknown,
  services: AssistantToolServices,
): Promise<ToolOutcome> {
  try {
    if (name === "find_shipments") {
      const parsed = findInput.safeParse(input);
      if (!parsed.success) return failure("Invalid input for find_shipments.");
      const { query, status } = parsed.data;
      const shipments = await services.findShipments(actor, {
        query: query || undefined,
        status: status === "ANY" ? undefined : status,
      });
      return {
        content: JSON.stringify({ shipments: shipments.map(shipmentSummary) }),
        isError: false,
        shipments: shipments.map(({ id, trackingNumber }) => ({ id, trackingNumber })),
      };
    }

    if (name === "get_shipment" || name === "get_shipment_payments") {
      const parsed = shipmentInput.safeParse(input);
      if (!parsed.success) return failure("Invalid shipment id. Call find_shipments to get a valid id.");
      const id = parsed.data.shipment_id;
      if (name === "get_shipment") {
        const shipment = await services.getShipment(actor, id);
        const events = shipment.events.map((event) => ({
          type: event.type,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          note: event.publicNote,
          at: iso(event.occurredAt),
        }));
        return {
          content: JSON.stringify({ shipment: shipmentSummary(shipment), events }),
          isError: false,
          shipmentId: id,
          shipments: [{ id: shipment.id, trackingNumber: shipment.trackingNumber }],
        };
      }
      if (actor.role !== "CUSTOMER") return failure("Payment records are not available for this role.", id);
      const payments = await services.listShipmentPayments(actor, id);
      const result = payments.map((payment) => ({
        id: payment.id,
        amount: `${payment.amount.toString()} ${payment.currency}`,
        status: payment.status,
        paidAt: iso(payment.paidAt),
        refundedAt: iso(payment.refundedAt),
        createdAt: iso(payment.createdAt),
      }));
      return { content: JSON.stringify({ payments: result }), isError: false, shipmentId: id };
    }

    return failure(`Unknown tool: ${name}.`);
  } catch (error) {
    // Out-of-scope records surface as 404 or 403 from the services. Report them
    // the same way so the assistant cannot confirm that another user's record exists.
    if (error instanceof AppError && (error.status === 404 || error.status === 403)) {
      return failure("Not found, or not available to this user.");
    }
    throw error;
  }
}
