import { z } from "zod";
// Browser-safe equivalent of the auth/profile validators. No Buffer or Prisma.
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const phone = z.string().trim().min(5).max(30);
const password = z
  .string()
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "Password must be no more than 72 UTF-8 bytes",
  );
export const loginFields = z
  .object({ email, password: z.string().min(1).pipe(password) })
  .strict();
export const registrationFields = z
  .object({
    name: z.string().trim().min(2).max(100),
    email,
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .pipe(password),
    phone: phone.optional(),
  })
  .strict();
export const profileFields = z
  .object({
    name: z.string().trim().min(2).max(100),
    email,
    phone: phone.nullable(),
  })
  .strict();
