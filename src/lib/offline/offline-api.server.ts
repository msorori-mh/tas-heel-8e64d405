import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export function offlineApiError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function createOfflineCaller(
  request: Request,
): Promise<
  { supabase: SupabaseClient<Database>; error?: never } | { error: Response; supabase?: never }
> {
  const url = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !publishableKey) return { error: offlineApiError(500, "server_misconfigured") };

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return { error: offlineApiError(401, "unauthorized") };
  const token = header.slice("Bearer ".length).trim();
  if (!token) return { error: offlineApiError(401, "unauthorized") };

  const supabase = createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  if (error || !userId) return { error: offlineApiError(401, "unauthorized") };
  return { supabase };
}
