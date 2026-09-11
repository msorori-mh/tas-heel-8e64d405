import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../../src/integrations/supabase/client";
import {
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  PUBLIC_SUPABASE_URL,
} from "../../../../src/integrations/supabase/public-config";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || PUBLIC_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const featureFlag = import.meta.env.VITE_ACADEMY_ENABLED?.trim().toLowerCase();

export const academyBackendConfigured = Boolean(supabaseUrl && supabaseKey);
export const academyFeatureEnabled = import.meta.env.PROD
  ? featureFlag === "true"
  : featureFlag !== "false";

// One auth client owns PKCE exchange, session persistence and refresh for BOTH
// portals. Only the PostgREST schema differs. Two GoTrue clients sharing the
// same storage key can exchange/refresh the same one-use credentials twice.
export const academySupabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    if (property === "from" || property === "rpc") {
      const schema = (supabase as unknown as SupabaseClient).schema("academy");
      return schema[property].bind(schema);
    }
    const value = Reflect.get(supabase, property);
    return typeof value === "function" ? value.bind(supabase) : value;
  },
});

export function requireAcademyBackend(): void {
  if (!academyBackendConfigured) {
    throw new Error(
      "إعدادات الاتصال بالأكاديمية غير موجودة. أضف VITE_SUPABASE_URL وVITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
}
