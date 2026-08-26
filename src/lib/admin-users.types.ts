import type { Database } from "@/integrations/supabase/types";

export type AssignableAdminRole = "user" | "content_manager" | "admin";
export type StaffAppRole = Exclude<Database["public"]["Enums"]["app_role"], "moderator" | "user">;

export type AdminUserListItem = {
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  roles: Database["public"]["Enums"]["app_role"][];
  status: "active" | "disabled";
};

export type AdminListUsersResponse = {
  users: AdminUserListItem[];
  count: number;
};

export type AdminCreateUserResponse = {
  ok: true;
  user_id: string;
  email: string;
  role: AssignableAdminRole;
};

export const ASSIGNABLE_ROLE_LABELS: Record<AssignableAdminRole, string> = {
  user: "طالب",
  content_manager: "مدير محتوى",
  admin: "مدير كامل",
};

export const APP_ROLE_LABELS: Record<Database["public"]["Enums"]["app_role"], string> = {
  admin: "مدير كامل",
  content_manager: "مدير محتوى",
  user: "طالب",
  moderator: "مشرف",
};

export function formatAdminUserRoles(roles: Database["public"]["Enums"]["app_role"][]): string {
  if (roles.length === 0) return ASSIGNABLE_ROLE_LABELS.user;
  return roles.map((r) => APP_ROLE_LABELS[r] ?? r).join("، ");
}
