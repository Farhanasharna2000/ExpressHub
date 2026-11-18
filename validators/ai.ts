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

export const bookingDraftRequestSchema = z.object({
  text: z.string().trim().min(10).max(1500),
}).strict();

export type BookingDraftRequestInput = z.infer<typeof bookingDraftRequestSchema>;

// refresh: true asks for a new brief even when today's is cached.
export const opsBriefRequestSchema = z.object({
  refresh: z.boolean().optional().default(false),
}).strict();

export type OpsBriefRequestInput = z.infer<typeof opsBriefRequestSchema>;

export const HELP_QUESTION_MAX = 500;

// A single public help question. No conversation history, so nothing to forge.
export const helpRequestSchema = z.object({
  question: z.string().trim().min(3, "Ask a question of at least 3 characters").max(HELP_QUESTION_MAX),
}).strict();

export type HelpRequestInput = z.infer<typeof helpRequestSchema>;
