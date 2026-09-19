import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  flushPendingDiagnostics,
  installDiagnosticsListeners,
} from "@/lib/diagnostics/telemetry";

/**
 * Mounts the global error listeners once and flushes queued (sanitized)
 * events after a session exists. Renders nothing and never blocks the UI.
 */
export function DiagnosticsBridge() {
  const { session } = useAuth();

  useEffect(() => installDiagnosticsListeners(), []);

  useEffect(() => {
    if (!session?.user?.id) return;
    void flushPendingDiagnostics();
  }, [session?.user?.id]);

  return null;
}

export default DiagnosticsBridge;
