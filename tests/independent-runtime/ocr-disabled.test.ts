import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: () => ({ handler: (handler: () => Promise<unknown>) => handler }),
    }),
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("the student OCR handler never sends a receipt even with provider credentials configured", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("GEMINI_API_KEY", "TEST_ONLY");
  vi.stubEnv("RECEIPT_OCR_MODEL", "gemini-test-model");
  const { extractReceiptData } = await import("../../src/lib/payments-ocr.functions");
  await expect(
    extractReceiptData({
      data: {
        imageBase64: Buffer.from("synthetic fixture only; not a real receipt").toString("base64"),
        mimeType: "image/png",
      },
    }),
  ).rejects.toThrow("receipt_ocr_unavailable");
  expect(fetcher).not.toHaveBeenCalled();
});
