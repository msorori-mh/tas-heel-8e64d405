/**
 * Register the PWA service worker in production only and expose a safe,
 * user-driven update flow:
 * - A newly installed worker never activates on its own; the page keeps
 *   running on the current version (no session or exam interruption).
 * - When an update is ready, a `pwa:update-available` CustomEvent is
 *   dispatched with the registration so the UI can offer an explicit
 *   "update now" action (see src/components/pwa/PwaUpdateNotice.tsx).
 * - Activation happens only after that explicit action posts SKIP_WAITING,
 *   followed by a one-shot reload on `controllerchange`.
 */

export const PWA_UPDATE_EVENT = "pwa:update-available";

function dispatchUpdateAvailable(registration: ServiceWorkerRegistration): void {
  window.dispatchEvent(
    new CustomEvent<ServiceWorkerRegistration>(PWA_UPDATE_EVENT, {
      detail: registration,
    }),
  );
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !import.meta.env.PROD) {
    return;
  }

  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // An updated worker is already waiting (e.g. installed in another tab).
        if (registration.waiting && navigator.serviceWorker.controller) {
          dispatchUpdateAvailable(registration);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // installed + an active controller => this is an update, not
            // the first install. First installs activate silently and
            // never trigger the notice.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              dispatchUpdateAvailable(registration);
            }
          });
        });
      })
      .catch(() => undefined);
  });
}

let reloadScheduled = false;

/**
 * Activate the waiting worker after an explicit user action, then reload
 * exactly once when the new worker takes control. Never call this
 * automatically — callers must be explicit user gestures.
 */
export function applyPendingUpdate(registration: ServiceWorkerRegistration): void {
  if (!registration.waiting) return;
  if (!reloadScheduled) {
    reloadScheduled = true;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        window.location.reload();
      },
      { once: true },
    );
  }
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
}
