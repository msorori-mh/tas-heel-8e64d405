import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export type Workspace = "student" | "teacher";
const PREFIX = "tamkeen.workspace.v1:";

/** A per-account navigation preference, never proof of a role or permission. */
export async function rememberWorkspace(userId: string, workspace: Workspace): Promise<void> {
  try {
    if (Capacitor.isNativePlatform())
      await Preferences.set({ key: PREFIX + userId, value: workspace });
    else localStorage.setItem(PREFIX + userId, workspace);
  } catch {
    /* Optional preference. */
  }
}

export async function readWorkspace(userId: string): Promise<Workspace | null> {
  try {
    const value = Capacitor.isNativePlatform()
      ? (await Preferences.get({ key: PREFIX + userId })).value
      : localStorage.getItem(PREFIX + userId);
    return value === "student" || value === "teacher" ? value : null;
  } catch {
    return null;
  }
}

export async function resolveWorkspaceHome(userId: string, studentComplete: boolean) {
  const preferred = await readWorkspace(userId);
  if (preferred === "teacher") return "/academy" as const;
  if (studentComplete) return "/app" as const;
  if (preferred !== "student" && navigator.onLine) {
    const { data, error } = await (supabase as SupabaseClient)
      .schema("academy")
      .from("teacher_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data) return "/academy" as const;
  }
  return "/complete-profile" as const;
}
