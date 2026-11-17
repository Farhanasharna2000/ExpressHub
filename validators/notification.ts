import { z } from "zod";
import { paginationFields } from "@/validators/list-query";

export const notificationIdSchema = z.cuid();

export const listDeadNotificationsSchema = z.object({ ...paginationFields }).strict();

export type ListDeadNotificationsInput = z.infer<typeof listDeadNotificationsSchema>;
