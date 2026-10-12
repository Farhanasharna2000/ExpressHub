import { z } from "zod";

// Small JPEG avatars are stored with the account, avoiding filesystem-only uploads.
export const profilePhotoSchema = z.string().max(280000, "Choose a smaller photo.")
  .regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/, "Choose a valid profile photo.")
  .nullable().optional();
