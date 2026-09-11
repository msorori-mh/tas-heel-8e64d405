import { Capacitor } from "@capacitor/core";

export interface AcademyBeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PwaState = {
  installPrompt: AcademyBeforeInstallPromptEvent | null;
  updateReady: ServiceWorker | null;
  online: boolean;
};

type Listener = (state: PwaState) => void;

let state: PwaState = {
  installPrompt: null,
  updateReady: null,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
};
const listeners = new Set<Listener>();
let initialized = false;

function applyAcademyDocumentMetadata(): void {
  const manifests = document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]');
  if (manifests.length === 0) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/academy-manifest.webmanifest";
    document.head.append(manifest);
  } else {
    manifests.forEach((manifest) => {
      manifest.href = "/academy-manifest.webmanifest";
    });
  }

  let appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!appleIcon) {
    appleIcon = document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    document.head.append(appleIcon);
  }
  appleIcon.href = "/academy-apple-touch-icon.png";
}

function emit(next: Partial<PwaState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener(state));
}

export function getAcademyPwaState(): PwaState {
  return state;
}

export function subscribeAcademyPwa(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function isAcademyStandalone(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isAcademyIos(): boolean {
  if (typeof window === "undefined") return false;
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || touchMac;
}

export async function requestAcademyInstall(): Promise<boolean> {
  const prompt = state.installPrompt;
  if (!prompt) return false;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome === "accepted") emit({ installPrompt: null });
  return choice.outcome === "accepted";
}

export function activateAcademyUpdate(): void {
  state.updateReady?.postMessage({ type: "SKIP_WAITING" });
}

export function initializeAcademyPwa(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  applyAcademyDocumentMetadata();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    emit({ installPrompt: event as AcademyBeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => emit({ installPrompt: null }));
  window.addEventListener("online", () => emit({ online: true }));
  window.addEventListener("offline", () => emit({ online: false }));

  if (Capacitor.isNativePlatform() || !("serviceWorker" in navigator) || !window.isSecureContext)
    return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/academy-sw.js", { scope: "/academy/" })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          emit({ updateReady: registration.waiting });
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              emit({ updateReady: installing });
            }
          });
        });
      })
      .catch(() => undefined);
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
}
