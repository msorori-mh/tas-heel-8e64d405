import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireContentStaffAuth,
  type ContentStaffAuthContext,
} from "@/integrations/supabase/auth-middleware";

const Input = z.object({ batchId: z.string().uuid() });

/**
 * CF11-R6: identity binding is a human editorial action, so it is executed with the signed-in
 * admin's own token through the SECURITY DEFINER operator wrapper. The raw RPC is revoked from
 * `service_role`, which means no machine key can bind an identity on a reviewer's behalf.
 */
type OperatorClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export const bindApprovedGoldenLessonIdentity = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, isFullAdmin } = context as ContentStaffAuthContext;
    if (!isFullAdmin) throw new Error("IDENTITY_BIND_ADMIN_REQUIRED");
    const db = (context as ContentStaffAuthContext).supabase as unknown as OperatorClient;
    const result = await db.rpc("golden_lesson_bind_authoritative_identity_operator", {
      _batch_id: data.batchId,
      _actor_id: userId,
    });
    if (result.error || !result.data)
      throw new Error(result.error?.message ?? "IDENTITY_BIND_EMPTY_RESPONSE");
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
