import { Capacitor } from "@capacitor/core";

/** Retire only this app's old web workers; native assets need no second updater. */
export async function prepareNativeShell(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !("serviceWorker" in navigator)) return false;
  const ownScripts = new Set(["/sw.js", "/academy-sw.js"]);
  const registrations = await navigator.serviceWorker.getRegistrations();
  let removed = false;
  for (const registration of registrations) {
    const worker = registration.active ?? registration.waiting ?? registration.installing;
    if (!worker) continue;
    const url = new URL(worker.scriptURL);
    if (url.origin === location.origin && ownScripts.has(url.pathname)) {
      removed = (await registration.unregister()) || removed;
    }
  }
  if (removed && navigator.serviceWorker.controller) {
    location.reload();
    return true;
  }
  return false;
}
