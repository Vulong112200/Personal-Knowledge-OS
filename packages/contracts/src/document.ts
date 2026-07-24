import { z } from "zod";

export const documentStatusSchema = z.enum([
  "uploaded",
  "processing",
  "processed",
  "failed",
  "needs_ocr",
]);

export type DocumentStatus = z.infer<typeof documentStatusSchema>;

// How a document entered the system. "note" = authored in-app (no stored file).
export const documentSourceSchema = z.enum(["upload", "note"]);
export type DocumentSource = z.infer<typeof documentSourceSchema>;

export const NOTE_TITLE_MAX = 300;

// In-app note authoring. Content is Markdown; it flows through the same
// extract→chunk→tag→embed→graph pipeline as an uploaded document.
export const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(NOTE_TITLE_MAX),
  content: z.string().default(""),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z
  .object({
    title: z.string().trim().min(1).max(NOTE_TITLE_MAX).optional(),
    content: z.string().optional(),
  })
  .refine((d) => d.title !== undefined || d.content !== undefined, {
    message: "Provide at least one of title or content",
  });
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
