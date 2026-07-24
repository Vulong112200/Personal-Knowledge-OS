import { z } from "zod";

export const chatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof chatRoleSchema>;

// A document cited by a [#n] marker in an assistant reply. Persisted per assistant message
// (ai_chat_messages.sources JSONB) so citations survive a reload, and returned inline on the
// send response.
export const chatSourceSchema = z.object({
  index: z.number().int().positive(),
  documentId: z.string().uuid(),
  title: z.string(),
});
export type ChatSource = z.infer<typeof chatSourceSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  role: chatRoleSchema,
  content: z.string(),
  // Only assistant messages from whole-KB chat carry sources; everything else is null.
  sources: z.array(chatSourceSchema).nullable().optional(),
});
export type ChatMessageDto = z.infer<typeof chatMessageSchema>;
