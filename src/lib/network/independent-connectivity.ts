import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
} from "@/integrations/supabase/public-config";
import { createServiceReachability } from "./service-reachability";

let service: ReturnType<typeof createServiceReachability> | undefined;
let nativeConnected: boolean | undefined;
export function getIndependentConnectivity() {
  if (import.meta.env?.VITE_INDEPENDENT_STAGING !== "true" || typeof window === "undefined")
    return undefined;
  if (!service) {
    service = createServiceReachability({
      url: PUBLIC_SUPABASE_URL,
      publicKey: PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      fetch: window.fetch.bind(window),
      physicalOnline: () => nativeConnected ?? navigator.onLine,
    });
    window.addEventListener("offline", () => service?.physicalChanged(false));
    window.addEventListener("online", () => service?.physicalChanged(true));
    window.addEventListener("focus", () => {
      if (!service?.isOnline()) void service?.probe();
    });
    service.start();
  }
  return service;
}
export function updateIndependentNativeNetwork(connected: boolean) {
  nativeConnected = connected;
  getIndependentConnectivity()?.physicalChanged(connected);
}
