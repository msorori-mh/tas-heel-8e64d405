import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ReceiptExtraction } from "./receipt-ocr.server";
export type { ReceiptExtraction } from "./receipt-ocr.server";

export const extractReceiptData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        imageBase64: z.string().min(32).max(12_000_000),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      })
      .parse(data),
  )
  .handler(async (): Promise<ReceiptExtraction> => {
    // This student-facing app may be used by minors. The direct Gemini
    // candidate is deliberately NOT connected: its current terms exclude
    // API clients directed at, or likely accessed by, people under 18.
    // Keep the existing manual-entry fallback until a suitable provider is reviewed.
    throw new Error("receipt_ocr_unavailable");
  });
