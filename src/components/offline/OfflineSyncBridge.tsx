import { useEffect } from "react";
import { syncOfflineOutboxForCurrentSession } from "@/lib/offline/offline-sync";
import { createOfflineSyncScheduler } from "@/lib/offline/offline-sync-scheduler";

export function OfflineSyncBridge() {
  useEffect(() => {
    const scheduler = createOfflineSyncScheduler({
      sync: syncOfflineOutboxForCurrentSession,
      canSync: () => navigator.onLine && document.visibilityState === "visible",
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduler.wake();
      else scheduler.pause();
    };
    window.addEventListener("online", scheduler.wake);
    window.addEventListener("offline", scheduler.pause);
    document.addEventListener("visibilitychange", onVisibility);
    scheduler.wake();
    return () => {
      scheduler.stop();
      window.removeEventListener("online", scheduler.wake);
      window.removeEventListener("offline", scheduler.pause);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return null;
}
export default OfflineSyncBridge;
