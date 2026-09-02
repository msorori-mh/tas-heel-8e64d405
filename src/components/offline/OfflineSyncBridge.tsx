/** OFFLINE-05 — resumes queued student activity on launch, focus and reconnect. */

import { useEffect } from "react";

import { syncOfflineOutboxForCurrentSession } from "@/lib/offline/offline-sync";

export function OfflineSyncBridge() {
  useEffect(() => {
    let disposed = false;
    let running = false;
    const sync = async () => {
      if (disposed || running || (typeof navigator !== "undefined" && !navigator.onLine)) return;
      running = true;
      try {
        await syncOfflineOutboxForCurrentSession();
      } catch {
        // The durable queue remains pending and will retry on the next signal.
      } finally {
        running = false;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVisibility);
    void sync();
    return () => {
      disposed = true;
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return null;
}

export default OfflineSyncBridge;
