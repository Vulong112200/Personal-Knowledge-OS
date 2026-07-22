import { z } from "zod";

export const documentStatusSchema = z.enum([
  "uploaded",
  "processing",
  "processed",
  "failed",
  "needs_ocr",
]);

export type DocumentStatus = z.infer<typeof documentStatusSchema>;
