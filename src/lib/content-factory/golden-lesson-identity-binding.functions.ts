import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireContentStaffAuth, type ContentStaffAuthContext } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ batchId: z.string().uuid() });

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("CONTENT_FACTORY_IDENTITY_BINDING_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const bindApprovedGoldenLessonIdentity = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, isFullAdmin } = context as ContentStaffAuthContext;
    if (!isFullAdmin) throw new Error("IDENTITY_BIND_ADMIN_REQUIRED");
    const result = await serviceClient().rpc("golden_lesson_bind_authoritative_identity" as never, {
      _batch_id: data.batchId,
      _actor_id: userId,
    } as never);
    if (result.error || !result.data) throw new Error(result.error?.message ?? "IDENTITY_BIND_EMPTY_RESPONSE");
    const value = result.data as unknown as Record<string, unknown>;
    return {
      bindingId: String(value.binding_id),
      identitySha256: String(value.identity_sha256),
      idempotent: Boolean(value.idempotent),
      writesPerformed: Number(value.writes_performed),
      curriculumCreationPerformed: false as const,
      domainWritesPerformed: 0 as const,
      publicationPerformed: false as const,
    };
  });
