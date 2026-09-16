/** OFFLINE-05 — resumes queued student activity on launch, focus and reconnect. */

import { offlineReconnectDelay } from "@/lib/offline/sync-backoff";
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (disposed || running || timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        void sync();
      }, offlineReconnectDelay());
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule();
    };
    window.addEventListener("online", schedule);
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("online", schedule);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return null;
}

export default OfflineSyncBridge;
