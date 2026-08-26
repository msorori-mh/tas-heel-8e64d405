/**
 * 18C2 — renderer-agnostic entry point for in-app PDF delivery.
 *
 * The PdfRendererAdapter picks the engine; the surrounding 18C architecture
 * (secure route, cache, versioning, packs, prefetch) is untouched.
 *   - Android native → android.graphics.pdf.PdfRenderer (Arabic-correct)
 *   - Browser with its own PDF engine → BROWSER_NATIVE
 *   - Everything else → pdf.js (legacy fallback only)
 */

import { Suspense, lazy, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { selectPdfRenderer, type PdfRendererKind } from "@/lib/pdf/pdf-renderer-adapter";
import type { PdfViewerProps } from "./PdfViewer";

const PdfViewer = lazy(() => import("./PdfViewer").then((m) => ({ default: m.PdfViewer })));
const NativePdfDelivery = lazy(() =>
  import("./NativePdfDelivery").then((m) => ({ default: m.NativePdfDelivery })),
);
const BrowserNativePdfDelivery = lazy(() =>
  import("./BrowserNativePdfDelivery").then((m) => ({ default: m.BrowserNativePdfDelivery })),
);

function Placeholder() {
  return (
    <section
      dir="rtl"
      className="grid min-h-80 place-items-center rounded-2xl border border-border bg-card p-4 shadow-card"
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        جارٍ تجهيز عارض الملف…
      </span>
    </section>
  );
}

/**
 * 21B2/21B3 — warm every reader runtime asset so a downloaded book can be
 * opened offline on the very first try. Delegates to the 21B3 readiness
 * module, which also records READER_READY for the offline badge.
 */
export function prefetchPdfViewerChunk(): void {
  void import("@/lib/pdf/reader-runtime").then((m) => m.ensureReaderReady()).catch(() => undefined);
}

export function InAppPdfDelivery(props: PdfViewerProps) {
  const [renderer, setRenderer] = useState<PdfRendererKind | null>(null);
  useEffect(() => setRenderer(selectPdfRenderer()), []);

  if (!renderer) return <Placeholder />;

  return (
    <Suspense fallback={<Placeholder />}>
      {renderer === "ANDROID_NATIVE" ? (
        <NativePdfDelivery {...props} />
      ) : renderer === "BROWSER_NATIVE" ? (
        <BrowserNativePdfDelivery {...props} />
      ) : (
        <PdfViewer {...props} />
      )}
    </Suspense>
  );
}

export default InAppPdfDelivery;
