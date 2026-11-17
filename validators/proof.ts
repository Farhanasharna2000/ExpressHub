import { z } from "zod";
import { PROOF_KINDS } from "@/lib/delivery-proof";

export const recipientNameSchema = z
  .string()
  .trim()
  .min(2, "Enter the name of the person who received the parcel")
  .max(100, "Keep the recipient name under 100 characters");

export const proofKindSchema = z.enum(PROOF_KINDS);

export const proofFieldsSchema = z.object({
  recipientName: recipientNameSchema,
  capturedAt: z.iso.datetime({ offset: true }).optional(),
});

export type ProofFields = z.infer<typeof proofFieldsSchema>;
