import { z } from "zod";

export const assistantMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ role: z.literal("assistant"), content: z.string().trim().min(1).max(8000) }).strict(),
]);

// The client sends only the visible text of the conversation. Tool calls and
// results are rebuilt on the server, so a client can never inject tool output.
export const assistantRequestSchema = z.object({
  messages: z.array(assistantMessageSchema).min(1).max(20),
}).strict().refine(
  ({ messages }) => messages.every((message, index) => message.role === (index % 2 === 0 ? "user" : "assistant"))
    && messages.at(-1)?.role === "user",
  { message: "Messages must alternate starting and ending with the user", path: ["messages"] },
);

export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type AssistantRequestInput = z.infer<typeof assistantRequestSchema>;
