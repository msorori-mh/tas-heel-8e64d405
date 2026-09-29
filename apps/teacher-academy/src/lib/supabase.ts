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

// Both workspaces share one auth instance, including same-tab sign-out events.
// Only the database schema differs; neither workspace grants the other a role.
const sharedClient: SupabaseClient = supabase;
const academyDatabase = sharedClient.schema("academy");
export const academySupabase = {
  auth: sharedClient.auth,
  from: academyDatabase.from.bind(academyDatabase),
  rpc: academyDatabase.rpc.bind(academyDatabase),
  schema: sharedClient.schema.bind(sharedClient),
};

export function requireAcademyBackend(): void {
  if (!academyBackendConfigured) {
    throw new Error(
      "إعدادات الاتصال بالأكاديمية غير موجودة. أضف VITE_SUPABASE_URL وVITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
}
