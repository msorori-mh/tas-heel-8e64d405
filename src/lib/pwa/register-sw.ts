/**
 * Register the PWA service worker in production only.
 * Uses a minimal public/sw.js that caches static shell assets only.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !import.meta.env.PROD) {
    return;
  }

  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
