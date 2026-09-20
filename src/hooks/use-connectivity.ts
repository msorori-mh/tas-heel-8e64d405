import { useEffect, useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";

let installed = false;
/** Called before creating the router, so cold-start remote queries begin paused. */
export function initializeConnectivity() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  onlineManager.setOnline(navigator.onLine);
  onlineManager.setEventListener((setOnline) => {
    let disposed = false;
    let removeNative: (() => Promise<void>) | undefined;
    const online = () => setOnline(true);
    const offline = () => setOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if (Capacitor.isNativePlatform())
      void import("@capacitor/network")
        .then(async ({ Network }) => {
          const listener = await Network.addListener("networkStatusChange", (status) => {
            if (!disposed) setOnline(status.connected);
          });
          if (disposed) {
            await listener.remove();
            return;
          }
          removeNative = () => listener.remove();
          const status = await Network.getStatus();
          if (!disposed) setOnline(status.connected);
        })
        .catch(() => undefined);
    return () => {
      disposed = true;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      void removeNative?.();
    };
  });
}
const subscribe = (listener: () => void) => onlineManager.subscribe(listener);
const snapshot = () => onlineManager.isOnline();
export function useConnectivity() {
  useEffect(initializeConnectivity, []);
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
