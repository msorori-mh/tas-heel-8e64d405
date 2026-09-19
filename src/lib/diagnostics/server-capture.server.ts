/**
 * Best-effort SSR 500 capture. Server-only.
 *
 * Hard rules: never throws, never retries, bounded by a short timeout, and
 * disables itself after a failure so telemetry can never cause a recursive
 * failure loop inside the request path.
 */

import { buildDiagnosticEvent } from "./diagnostics-contract";

const TIMEOUT_MS = 1_500;
let disabled = false;
let lastFingerprint = "";
let lastAt = 0;

export async function captureServerDiagnostic(params: {
  error: unknown;
  route?: string | null;
  action?: string | null;
}): Promise<void> {
  if (disabled) return;
  try {
    const event = buildDiagnosticEvent({
      source: "server",
      eventType: "ssr_500",
      severity: "fatal",
      error: params.error,
      route: params.route ?? null,
      action: params.action ?? "ssr_request",
      context: { platform: "server" },
    });

    // Cheap in-process dedupe: identical failures within 30s are dropped.
    const now = Date.now();
    if (event.fingerprint === lastFingerprint && now - lastAt < 30_000) return;
    lastFingerprint = event.fingerprint;
    lastAt = now;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const insert = supabaseAdmin.from("app_diagnostic_events").insert(event);
    await Promise.race([insert, new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS))]);
  } catch {
    // A telemetry failure (e.g. missing service role config) must be terminal.
    disabled = true;
  }
}
