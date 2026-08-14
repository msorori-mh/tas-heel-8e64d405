import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireAdminAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AdminCreateUserResponse,
  AdminListUsersResponse,
  AdminUserListItem,
  AssignableAdminRole,
} from "./admin-users.types";

const AssignableRoleSchema = z.enum(["user", "content_manager", "admin"]);

const CreateUserInput = z
  .object({
    email: z.string().trim().email("البريد الإلكتروني غير صالح"),
    full_name: z.string().trim().min(1, "الاسم الكامل مطلوب"),
    temporary_password: z
      .string()
      .min(12, "كلمة المرور يجب أن تكون 12 حرفاً على الأقل"),
    role: AssignableRoleSchema,
    confirmGrantAdmin: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "admin" && data.confirmGrantAdmin !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب تأكيد منح صلاحيات المدير الكامل",
        path: ["confirmGrantAdmin"],
      });
    }
  });

const LIST_PAGE_SIZE = 200;
const MAX_LIST_PAGES = 10;

function userStatus(
  bannedUntil: string | undefined | null,
): AdminUserListItem["status"] {
  if (!bannedUntil) return "active";
  const until = Date.parse(bannedUntil);
  if (Number.isNaN(until)) return "active";
  return until > Date.now() ? "disabled" : "active";
}

async function loadAllAuthUsers(
  supabaseAdmin: SupabaseClient<Database>,
): Promise<User[]> {
  const all: User[] = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: LIST_PAGE_SIZE,
    });
    if (error) {
      throw new Error(`تعذر تحميل المستخدمين: ${error.message}`);
    }
    all.push(...(data.users ?? []));
    if ((data.users?.length ?? 0) < LIST_PAGE_SIZE) break;
  }
  return all;
}

/** Lists auth users with profiles and roles — full admin only, server-side. */
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async (): Promise<AdminListUsersResponse> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const authUsers = await loadAllAuthUsers(supabaseAdmin);
    const userIds = authUsers.map((u) => u.id);

    if (userIds.length === 0) {
      return { users: [], count: 0 };
    }

    const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds),
        supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds),
      ]);

    if (profilesError) {
      throw new Error(`تعذر تحميل الملفات الشخصية: ${profilesError.message}`);
    }
    if (rolesError) {
      throw new Error(`تعذر تحميل الأدوار: ${rolesError.message}`);
    }

    const profileByUser = new Map(
      (profiles ?? []).map((p) => [p.user_id, p.full_name] as const),
    );
    const rolesByUser = new Map<string, Database["public"]["Enums"]["app_role"][]>();
    for (const row of roles ?? []) {
      const list = rolesByUser.get(row.user_id) ?? [];
      list.push(row.role);
      rolesByUser.set(row.user_id, list);
    }

    const users: AdminUserListItem[] = authUsers.map((u) => ({
      user_id: u.id,
      email: u.email ?? "",
      full_name: profileByUser.get(u.id) ?? (u.user_metadata?.full_name as string | undefined) ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      roles: rolesByUser.get(u.id) ?? [],
      status: userStatus(u.banned_until),
    }));

    users.sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );

    return { users, count: users.length };
  });

/** Creates an auth user and optional staff role — full admin only, server-side. */
export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input) => CreateUserInput.parse(input))
  .handler(async ({ data, context }): Promise<AdminCreateUserResponse> => {
    const { userId: actorId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email.trim().toLowerCase(),
        password: data.temporary_password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name.trim() },
      });

    if (createError || !created.user) {
      throw new Error(
        createError?.message ?? "تعذر إنشاء المستخدم.",
      );
    }

    const newUserId = created.user.id;
    const role = data.role as AssignableAdminRole;

    try {
      if (role !== "user") {
        const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
          user_id: newUserId,
          role,
        });
        if (roleError) {
          throw roleError;
        }
      }

      await supabaseAdmin.from("audit_logs").insert({
        actor_id: actorId,
        action: "admin.user.created",
        target_type: "auth.users",
        target_id: newUserId,
        metadata: {
          email: data.email.trim().toLowerCase(),
          role,
          full_name: data.full_name.trim(),
        },
      });
    } catch (err) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      const message =
        err instanceof Error ? err.message : "تعذر إكمال إعداد المستخدم.";
      throw new Error(message);
    }

    return {
      ok: true,
      user_id: newUserId,
      email: data.email.trim().toLowerCase(),
      role,
    };
  });

const UpdateUserRolesInput = z
  .object({
    user_id: z.string().uuid(),
    roles: z.array(AssignableRoleSchema.exclude(["user"])).max(2),
    confirmGrantAdmin: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.roles.includes("admin") && data.confirmGrantAdmin !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب تأكيد منح صلاحيات المدير الكامل",
        path: ["confirmGrantAdmin"],
      });
    }
  });

/** Replaces staff roles for a user — full admin only, server-side. */
export const adminUpdateUserRoles = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input) => UpdateUserRolesInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { userId: actorId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const nextRoles = Array.from(new Set(data.roles));

    if (data.user_id === actorId && !nextRoles.includes("admin")) {
      throw new Error("لا يمكنك سحب صلاحيات المدير الكامل من حسابك.");
    }

    const { data: existing, error: readError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    if (readError) throw new Error(`تعذر قراءة الأدوار: ${readError.message}`);

    const currentStaff = (existing ?? [])
      .map((r) => r.role)
      .filter((r): r is Exclude<AssignableAdminRole, "user"> =>
        r === "admin" || r === "content_manager");

    const toRemove = currentStaff.filter((r) => !nextRoles.includes(r));
    const toAdd = nextRoles.filter((r) => !currentStaff.includes(r));

    if (toRemove.length > 0) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .in("role", toRemove);
      if (error) throw new Error(`تعذر إزالة الأدوار: ${error.message}`);
    }

    if (toAdd.length > 0) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert(toAdd.map((role) => ({ user_id: data.user_id, role })));
      if (error) throw new Error(`تعذر إضافة الأدوار: ${error.message}`);
    }

    if (toAdd.length > 0 || toRemove.length > 0) {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: actorId,
        action: "admin.user.roles_updated",
        target_type: "public.user_roles",
        target_id: data.user_id,
        metadata: { added: toAdd, removed: toRemove, roles: nextRoles },
      });
    }

    return { ok: true };
  });
