import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
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
  .handler(async ({ data }) => {
    const { extractReceiptDirect } = await import("./receipt-ocr.server");
    return extractReceiptDirect(data, {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.RECEIPT_OCR_MODEL,
    });
  });
