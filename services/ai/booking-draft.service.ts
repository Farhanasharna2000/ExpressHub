import type { AuthenticatedUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/errors";
import type { BookingDraftRequestInput } from "@/validators/ai";
import { createShipmentSchema } from "@/validators/shipment";
import type { AssistantUsage } from "@/services/ai/assistant.service";
import { BOOKING_DRAFT_FIELDS, BOOKING_PROMPT_VERSION, BOOKING_SYSTEM_PROMPT, type BookingDraftField } from "@/services/ai/prompts/booking";

const REQUIRED_FIELDS: BookingDraftField[] = [
  "pickupContactName", "pickupContactPhone", "pickupAddress",
  "deliveryContactName", "deliveryContactPhone", "deliveryAddress", "parcelWeightKg",
];
const MAX_NOTE_LENGTH = 300;

export type BookingDraft = Partial<{
  pickupContactName: string;
  pickupContactPhone: string;
  pickupAddress: string;
  deliveryContactName: string;
  deliveryContactPhone: string;
  deliveryAddress: string;
  packageDescription: string;
  parcelWeightKg: number;
  pickupScheduledAt: string;
}>;

export type BookingDraftResult = {
  draft: BookingDraft;
  filled: BookingDraftField[];
  missing: BookingDraftField[];
  note: string | null;
};

export type JsonGeneration = { text: string; usage: AssistantUsage; stopReason: string | null; refused: boolean };

export interface BookingDraftDeps {
  model: string;
  // One structured-output call. The provider returns JSON text matching BOOKING_DRAFT_SCHEMA.
  generateJson(request: { system: string; user: string }): Promise<JsonGeneration>;
  // Records metadata only: field names and token counts, never the customer's text.
  audit(actor: AuthenticatedUser, details: Record<string, unknown>): Promise<void>;
  now?: () => Date;
}

function bangladeshTime(now: Date) {
  const local = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}+06:00 (${local.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })})`;
}

// Each field is checked with the same rule the booking API applies. Anything that
// fails is dropped and left for the customer to fill in, never sent half-valid.
function validField(field: BookingDraftField, raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const value = raw.trim();
  if (field === "parcelWeightKg") {
    const weight = Math.round(Number(value) * 1000) / 1000;
    return createShipmentSchema.shape.parcelWeightKg.safeParse(weight).success ? weight : undefined;
  }
  const result = createShipmentSchema.shape[field].safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseBookingDraft(text: string): Pick<BookingDraftResult, "draft" | "note"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError(502, "The assistant could not read that description. Please try again.", "AI_UPSTREAM_ERROR");
  }
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const draft: Record<string, unknown> = {};
  for (const field of BOOKING_DRAFT_FIELDS) {
    const value = validField(field, record[field]);
    if (value !== undefined) draft[field] = value;
  }
  const note = typeof record.note === "string" && record.note.trim() ? record.note.trim().slice(0, MAX_NOTE_LENGTH) : null;
  return { draft: draft as BookingDraft, note };
}

export async function draftBooking(
  actor: AuthenticatedUser,
  input: BookingDraftRequestInput,
  deps: BookingDraftDeps,
): Promise<BookingDraftResult> {
  if (actor.role !== "CUSTOMER") {
    throw new AppError(403, "Only customers can book shipments", "FORBIDDEN");
  }

  let generation: JsonGeneration | null = null;
  let result: BookingDraftResult | null = null;
  try {
    generation = await deps.generateJson({
      system: BOOKING_SYSTEM_PROMPT,
      // Tag markers are removed from the text so it cannot close its own data block.
      user: `Current Bangladesh time: ${bangladeshTime(deps.now?.() ?? new Date())}\n\n<customer_text>\n${input.text.replace(/<\/?\s*customer_text\s*>/gi, "")}\n</customer_text>`,
    });
    if (generation.refused) {
      throw new AppError(422, "That description could not be used for a booking. Please describe the parcel, pickup and delivery details.", "AI_REFUSED");
    }
    const { draft, note } = parseBookingDraft(generation.text);
    const filled = BOOKING_DRAFT_FIELDS.filter((field) => field in draft);
    result = { draft, filled, missing: REQUIRED_FIELDS.filter((field) => !(field in draft)), note };
    return result;
  } finally {
    await deps.audit(actor, {
      model: deps.model,
      promptVersion: BOOKING_PROMPT_VERSION,
      stopReason: generation?.stopReason ?? null,
      filled: result?.filled ?? [],
      missing: result?.missing ?? [],
      usage: generation?.usage ?? null,
    }).catch((error: unknown) => console.error("Booking draft audit write failed", error instanceof Error ? error.message : error));
  }
}
