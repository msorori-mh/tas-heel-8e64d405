import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const featureFlag = import.meta.env.VITE_ACADEMY_ENABLED?.trim().toLowerCase();

export const academyBackendConfigured = Boolean(supabaseUrl && supabaseKey);
export const academyFeatureEnabled = import.meta.env.PROD
  ? featureFlag === "true"
  : featureFlag !== "false";

export const academySupabase = createClient(
  supabaseUrl ?? "https://configuration-required.invalid",
  supabaseKey ?? "configuration-required",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    db: {
      schema: "academy",
    },
  },
);

export function requireAcademyBackend(): void {
  if (!academyBackendConfigured) {
    throw new Error(
      "إعدادات الاتصال بالأكاديمية غير موجودة. أضف VITE_SUPABASE_URL وVITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
}
