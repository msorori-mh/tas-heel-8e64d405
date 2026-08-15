import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * 17B — Android hardware back button.
 *
 * Web builds are untouched: the Capacitor plugin is imported dynamically and
 * only when running inside the native shell. Behaviour:
 *  - on a nested route -> go back in the router history
 *  - on the app root   -> minimise the app instead of destroying the WebView,
 *    so an in-flight exam session is never lost by pressing back.
 */
const ROOT_PATHS = new Set(["/", "/app"]);

export function AndroidBackHandler() {
  const router = useRouter();

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        // Let dialogs/sheets close themselves first: Radix listens on Escape,
        // so dispatch it before touching navigation.
        const openOverlay = document.querySelector("[data-state='open'][role='dialog']");
        if (openOverlay) {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          return;
        }
        const path = window.location.pathname;
        if (canGoBack && !ROOT_PATHS.has(path)) {
          router.history.back();
          return;
        }
        void App.minimizeApp();
      });
      if (cancelled) void handle.remove();
      else dispose = () => void handle.remove();
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [router]);

  return null;
}
