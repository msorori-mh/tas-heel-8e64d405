/**
 * DIAGNOSTICS-CENTER-01 — best-effort client telemetry.
 *
 * Rules enforced here:
 * - Never throws and never blocks the UI. Any failure is swallowed.
 * - Never inserts anonymously: without a session the sanitized event waits in
 *   sessionStorage (small bound) and is flushed after sign-in.
 * - Only sanitized technical context leaves the device (see diagnostics-contract).
 */

import { supabase } from "@/integrations/supabase/client";
import { getReleaseInfo } from "@/lib/release-info";
import {
  buildDiagnosticEvent,
  shouldSendEvent,
  type DiagnosticInput,
  type SanitizedDiagnosticEvent,
} from "./diagnostics-contract";

const PENDING_KEY = "tamkeen.diagnostics.pending.v1";
const PENDING_MAX = 10;
const seen = new Map<string, number>();
let sessionId: string | null = null;
let installed = false;
let sending = false;

function randomSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId(): string {
  if (sessionId) return sessionId;
  sessionId = randomSessionId();
  return sessionId;
}

type NetworkInformation = { effectiveType?: string; type?: string };

function readContext() {
  const release = getReleaseInfo();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const android = /Android\s+([\d.]+)/.exec(ua);
  const device = /Android[^;]*;\s*([^;)]+)\s*(?:Build|\))/.exec(ua);
  const connection =
    typeof navigator !== "undefined"
      ? ((navigator as unknown as { connection?: NetworkInformation }).connection ?? undefined)
      : undefined;

  const platform = android
    ? "android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "ios"
      : typeof window === "undefined"
        ? "server"
        : "web";

  return {
    appVersion: release.verifiable ? release.shortSha : "unknown",
    appBuild: release.builtAt,
    platform,
    osVersion: android ? `Android ${android[1]}` : "",
    deviceModel: device ? device[1]?.trim() : "",
    networkType: connection?.effectiveType ?? connection?.type ?? "",
    online: typeof navigator === "undefined" ? null : navigator.onLine,
    sessionId: getSessionId(),
  };
}

function readPending(): SanitizedDiagnosticEvent[] {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SanitizedDiagnosticEvent[]).slice(0, PENDING_MAX) : [];
  } catch {
    return [];
  }
}

function writePending(events: SanitizedDiagnosticEvent[]): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(events.slice(-PENDING_MAX)));
  } catch {
    /* storage may be unavailable or full */
  }
}

function queue(event: SanitizedDiagnosticEvent): void {
  if (typeof sessionStorage === "undefined") return;
  writePending([...readPending(), event]);
}

async function insert(events: SanitizedDiagnosticEvent[]): Promise<boolean> {
  if (events.length === 0) return true;
  try {
    const { error } = await supabase.from("app_diagnostic_events").insert(events);
    return !error;
  } catch {
    return false;
  }
}

async function hasSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

/** Best-effort capture. Always resolves; never rejects. */
export async function captureDiagnostic(input: DiagnosticInput): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    const event = buildDiagnosticEvent({
      ...input,
      route: input.route ?? window.location.pathname,
      context: { ...readContext(), ...(input.context ?? {}) },
    });
    if (!shouldSendEvent(seen, event.fingerprint, Date.now())) return;

    if (!(await hasSession())) {
      queue(event);
      return;
    }
    if (!(await insert([event]))) queue(event);
  } catch {
    /* telemetry must never surface an error to the student */
  }
}

/** Fire-and-forget helper for call sites that cannot await. */
export function captureDiagnosticSync(input: DiagnosticInput): void {
  void captureDiagnostic(input);
}

/** Flush queued events after a session exists. Safe to call repeatedly. */
export async function flushPendingDiagnostics(): Promise<void> {
  if (sending || typeof window === "undefined") return;
  sending = true;
  try {
    const pending = readPending();
    if (pending.length === 0) return;
    if (!(await hasSession())) return;
    if (await insert(pending)) writePending([]);
  } catch {
    /* ignore */
  } finally {
    sending = false;
  }
}

/** Global browser error hooks. Idempotent. */
export function installDiagnosticsListeners(): () => void {
  if (installed || typeof window === "undefined") return () => undefined;
  installed = true;

  const onError = (event: ErrorEvent) => {
    captureDiagnosticSync({
      eventType: "window_error",
      severity: "error",
      error: event.error ?? event.message,
      action: "window.onerror",
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    captureDiagnosticSync({
      eventType: "unhandled_rejection",
      severity: "error",
      error: event.reason,
      action: "unhandledrejection",
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    installed = false;
  };
}
