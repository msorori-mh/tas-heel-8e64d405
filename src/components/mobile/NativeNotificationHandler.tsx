import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { captureDiagnosticSync } from "@/lib/diagnostics/telemetry";

/** Opens only the allow-listed academy destination carried by local reminders. */
export function NativeNotificationHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      // Remote web updates can run inside an older binary without this plugin.
      if (!Capacitor.isPluginAvailable("LocalNotifications")) return;
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const handle = await LocalNotifications.addListener(
        "localNotificationActionPerformed",
        (action) => {
          if (action.notification.extra?.destination === "/academy") {
            navigate({ to: "/academy" });
          }
        },
      );
      if (cancelled) void handle.remove();
      else dispose = () => void handle.remove();
    })().catch((error: unknown) => {
      if (cancelled) return;
      captureDiagnosticSync({
        eventType: "native_notification_listener",
        severity: "warning",
        error,
        action: "initialize_local_notification_listener",
      });
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [navigate]);

  return null;
}
