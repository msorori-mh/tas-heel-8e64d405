import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getNetworkState } from "@/lib/offline/network";

export function useConnectivity() {
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    let active = true;
    let remove: (() => Promise<void>) | undefined;
    const update = () => {
      void getNetworkState().then((s) => {
        if (active) setOnline(s.online);
      });
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    if (Capacitor.isNativePlatform())
      void import("@capacitor/network")
        .then(async ({ Network }) => {
          const listener = await Network.addListener("networkStatusChange", (status) => {
            if (active) setOnline(status.connected);
          });
          if (!active) await listener.remove();
          else remove = () => listener.remove();
        })
        .catch(() => undefined);
    return () => {
      active = false;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      void remove?.();
    };
  }, []);
  return online;
}
