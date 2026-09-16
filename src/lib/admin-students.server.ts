import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

export const CreateStudentInput = z
  .object({
    email: z
      .string()
      .trim()
      .email("البريد الإلكتروني غير صالح")
      .max(254)
      .transform((v) => v.toLowerCase()),
    full_name: z.string().trim().min(2, "أدخل اسم الطالب").max(200),
  })
  .strict();

/** Called only after requireAdminAuth. Never updates an existing identity. */
export async function createStudent(
  admin: SupabaseClient<Database>,
  actorId: string,
  input: z.infer<typeof CreateStudentInput>,
) {
  const data = CreateStudentInput.parse(input);
  // No password or invitation: the student must authenticate with Google.
  // A confirmed email allows Supabase to link the verified Google identity.
  const { data: created, error } = await admin.auth.admin.createUser({
    email: data.email,
    email_confirm: true,
    user_metadata: { full_name: data.full_name },
    app_metadata: { created_by_admin: actorId },
  });
  if (error || !created.user) {
    if (error?.code === "email_exists" || error?.code === "user_already_exists") {
      throw new Error("هذا البريد مسجل بالفعل. لم يتم تغيير الحساب الموجود.");
    }
    throw new Error("تعذر إضافة الطالب. تحقق من البريد ثم أعد المحاولة.");
  }
  const id = created.user.id;
  try {
    const profile = await admin
      .from("profiles")
      .upsert({ user_id: id, full_name: data.full_name }, { onConflict: "user_id" });
    if (profile.error) throw profile.error;
    const audit = await admin.from("audit_logs").insert({
      actor_id: actorId,
      action: "admin.student.created",
      target_type: "auth.users",
      target_id: id,
      metadata: { sign_in_method: "google" },
    });
    if (audit.error) throw audit.error;
  } catch {
    const cleanup = await admin.auth.admin.deleteUser(id);
    if (cleanup.error) {
      throw new Error(
        `تم إنشاء الحساب لكن تعذر إكمال إعداده. راجع الحساب ${id} في إدارة المستخدمين قبل إعادة المحاولة.`,
      );
    }
    throw new Error("تعذر إكمال إضافة الطالب، وتم التراجع عن إنشاء الحساب. أعد المحاولة.");
  }
  return { ok: true as const, user_id: id, email: data.email };
}
