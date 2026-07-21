/**
 * Capture and expose the browser's `beforeinstallprompt` event so the
 * install hint can trigger a native install dialog on Android/Chromium,
 * and detect platform/standalone state for manual iOS guidance.
 *
 * The listener is registered at module load (the landing page chunk loads
 * immediately), which is early enough: Chromium fires the event only after
 * installability heuristics are met.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallPromptListener = (event: BeforeInstallPromptEvent | null) => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<InstallPromptListener>();

function notify() {
  listeners.forEach((listener) => listener(deferredPrompt));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function onInstallPromptChange(listener: InstallPromptListener): () => void {
  listeners.add(listener);
  listener(deferredPrompt);
  return () => {
    listeners.delete(listener);
  };
}

/** True when the app already runs installed (standalone display mode). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari legacy standalone flag.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** True on iPhone/iPad/iPod (Safari has no beforeinstallprompt). */
export function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const touchMac = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
  return /iP(hone|ad|od)/.test(ua) || touchMac;
}
