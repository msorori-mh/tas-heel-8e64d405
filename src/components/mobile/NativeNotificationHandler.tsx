import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

/** Opens only the allow-listed academy destination carried by local reminders. */
export function NativeNotificationHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
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
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [navigate]);

  return null;
}
