// Feature Flags configuration for Operational HTML Content Onboarding (PR 17 & 19)
import { supabase } from "@/integrations/supabase/client";

export const CONTENT_FEATURE_FLAGS = {
  ENABLE_HTML_CONTENT_BACKEND: import.meta.env.VITE_ENABLE_HTML_CONTENT_BACKEND === "true",
  ENABLE_HTML_CONTENT_UPLOAD: import.meta.env.VITE_ENABLE_HTML_CONTENT_UPLOAD === "true",
  ENABLE_HTML_CONTENT_PUBLISH: import.meta.env.VITE_ENABLE_HTML_CONTENT_PUBLISH === "true",
  ENABLE_HTML_CONTENT_STUDENT_READ: import.meta.env.VITE_ENABLE_HTML_CONTENT_STUDENT_READ === "true",
};

/**
 * Server-authoritative check via RPC `check_content_feature_flag`.
 * Missing flag or error fails closed (returns false).
 */
export async function isServerFeatureFlagEnabled(flagName: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("check_content_feature_flag", {
      p_flag_name: flagName,
    });
    if (error || typeof data !== "boolean") {
      return false;
    }
    return data;
  } catch {
    return false;
  }
}
