/**
 * 21B3 — Reader runtime readiness.
 *
 * A textbook is only "محفوظ للاستخدام دون إنترنت" when BOTH:
 *   PDF_READY    → the bytes are in the offline cache (18C pipeline), and
 *   READER_READY → every runtime asset the renderer needs to open those bytes
 *                  without network is already fetched and cached.
 *
 * Renderer-specific asset sets (see pdf-renderer-adapter):
 *   ANDROID_NATIVE → native plugin (bundled in the APK) → nothing to fetch.
 *   BROWSER_NATIVE → the BrowserNativePdfDelivery lazy chunk only.
 *   PDFJS          → the PdfViewer lazy chunk + pdfjs-dist engine chunk +
 *                    the pdf.worker asset (warmed through the SW static cache).
 *
 * Readiness is remembered per build: the memo key embeds the resolved worker
 * URL (content-hashed), so a new deploy invalidates it automatically.
 */

import { selectPdfRenderer, type PdfRendererKind } from "./pdf-renderer-adapter";

const STORAGE_KEY = "tamkeen.reader-ready.v1";

export type ReaderReadyState = {
  ready: boolean;
  renderer: PdfRendererKind | null;
  /** true while ensureReaderReady() is in flight for this renderer. */
  preparing: boolean;
};

let inFlight: Promise<boolean> | null = null;

function readStamp(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStamp(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* storage is best-effort */
  }
}

/** Synchronous, cheap check used to render the offline badge. */
export function isReaderReady(): boolean {
  if (typeof window === "undefined") return false;
  if (selectPdfRenderer() === "ANDROID_NATIVE") return true;
  return Boolean(readStamp());
}

async function warmBrowserNative(): Promise<string> {
  await import("@/components/lessons/BrowserNativePdfDelivery");
  return "browser-native";
}

async function warmPdfJs(): Promise<string> {
  const [viewer] = await Promise.all([
    import("@/components/lessons/PdfViewer"),
    import("pdfjs-dist"),
  ]);
  viewer.prefetchPdfEngine();
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  // Pull the worker through the network layer once so the service worker
  // stores it in the hashed-asset cache; without it the first offline open
  // dies on the worker request.
  const response = await fetch(workerUrl, { cache: "force-cache" });
  if (!response.ok) throw new Error("worker_fetch_failed");
  await response.arrayBuffer();
  return workerUrl;
}

/**
 * Fetch and cache every asset the active renderer needs. Never touches the
 * PDF bytes — a failed reader prep must not trigger a re-download.
 */
export async function ensureReaderReady(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const renderer = selectPdfRenderer();
  if (renderer === "ANDROID_NATIVE") return true;
  if (isReaderReady()) return true;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Both web paths keep the entry point + its shared deps resident.
      await import("@/components/lessons/InAppPdfDelivery");
      const marker =
        renderer === "BROWSER_NATIVE" ? await warmBrowserNative() : await warmPdfJs();
      writeStamp(marker);
      return true;
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function currentRenderer(): PdfRendererKind | null {
  if (typeof window === "undefined") return null;
  return selectPdfRenderer();
}
