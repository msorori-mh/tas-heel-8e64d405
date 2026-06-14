import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DeleteInput = z.object({
  password: z.string().min(1, "كلمة المرور مطلوبة"),
  confirmation: z.literal("DELETE"),
});

/**
 * Self-service account deletion.
 *
 * Flow:
 * 1. Verify the caller via requireSupabaseAuth (bearer token).
 * 2. Re-authenticate with their password (defense against stolen/hijacked sessions).
 * 3. Record an audit_logs entry (actor_id has ON DELETE SET NULL, so the row survives).
 * 4. Best-effort delete receipt files in storage (auth.users CASCADE doesn't reach storage objects).
 * 5. Call supabaseAdmin.auth.admin.deleteUser → cascades through every public.* table
 *    that has ON DELETE CASCADE FK to auth.users.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = (claims as { email?: string })?.email;

    if (!email) {
      throw new Error("تعذر التحقق من البريد الإلكتروني للحساب.");
    }

    // 2. Re-authenticate with password using an isolated client (no session persistence).
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const verifier = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: pwError } = await verifier.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (pwError) {
      throw new Error("كلمة المرور غير صحيحة.");
    }

    // 3. Audit log (best-effort; do not block deletion on failure).
    try {
      await supabase.from("audit_logs").insert({
        actor_id: userId,
        action: "account.self_delete",
        target_type: "auth.users",
        target_id: userId,
        metadata: { email },
      });
    } catch {
      // ignore
    }

    // 4. Load admin client and remove receipts owned by the user.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const { data: files } = await supabaseAdmin.storage
        .from("receipts")
        .list(userId, { limit: 1000 });
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from("receipts").remove(paths);
      }
    } catch {
      // non-fatal — auth.users delete proceeds regardless
    }

    // 5. Delete the auth user — cascades to all public tables with ON DELETE CASCADE.
    const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delError) {
      throw new Error(`تعذر حذف الحساب: ${delError.message}`);
    }

    return { ok: true as const };
  });
