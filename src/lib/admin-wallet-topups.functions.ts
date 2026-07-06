import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminAuth } from "@/integrations/supabase/auth-middleware";

const SIGNED_TTL = 600;

function normalizeReceiptStoragePath(path: string): string {
  let clean = path.trim();
  clean = clean.replace(/^supabase-storage:\/\/receipts\//i, "");
  clean = clean.replace(/^receipts\//i, "");
  clean = clean.replace(/^\/+/, "");
  return clean;
}

/** Full admin only — signed URL for a wallet top-up receipt via service role (server-side). */
export const getWalletTopupReceiptSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("wallet_topup_requests")
      .select("receipt_path")
      .eq("id", data.requestId)
      .maybeSingle();

    if (fetchErr) {
      console.warn("[getWalletTopupReceiptSignedUrl] fetch", fetchErr.message);
      throw new Error("تعذّر إنشاء رابط آمن لعرض الإيصال.");
    }

    if (!row?.receipt_path?.trim()) {
      throw new Error("تعذّر إنشاء رابط آمن لعرض الإيصال.");
    }

    const clean = normalizeReceiptStoragePath(row.receipt_path);
    if (!clean) {
      throw new Error("تعذّر إنشاء رابط آمن لعرض الإيصال.");
    }

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("receipts")
      .createSignedUrl(clean, SIGNED_TTL);

    if (signErr || !signed?.signedUrl) {
      console.warn("[getWalletTopupReceiptSignedUrl] sign", signErr?.message);
      throw new Error("تعذّر إنشاء رابط آمن لعرض الإيصال.");
    }

    return { signedUrl: signed.signedUrl };
  });
