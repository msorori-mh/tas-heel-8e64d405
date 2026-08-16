/**
 * 18C-2 — client-only wrapper around the in-app PDF viewer.
 *
 * pdf.js touches canvas/worker APIs, so the viewer is loaded lazily after
 * hydration; SSR renders a lightweight placeholder.
 */

import { Suspense, lazy, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import type { PdfViewerProps } from "./PdfViewer";

const PdfViewer = lazy(() =>
  import("./PdfViewer").then((m) => ({ default: m.PdfViewer })),
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

export function InAppPdfDelivery(props: PdfViewerProps) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (!hydrated) return <Placeholder />;
  return (
    <Suspense fallback={<Placeholder />}>
      <PdfViewer {...props} />
    </Suspense>
  );
}

export default InAppPdfDelivery;
