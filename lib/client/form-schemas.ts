import { z } from "zod";

export const archiveFormSchema = (label: string) => z.object({
  reason: z.string().trim().min(3, `${label} of at least 3 characters is required.`).max(1000),
});
export const roleFormSchema = z.object({ role: z.enum(["CUSTOMER", "COURIER", "ADMIN"]) });
export const courierFormSchema = z.object({ courierId: z.cuid() });
export const transitionFormSchema = (required: boolean) => z.object({
  note: z.string().trim().max(1000, "Note must not exceed 1000 characters.")
    .refine(value => (!required && !value) || value.length >= 3, "A note of at least 3 characters is required."),
});
