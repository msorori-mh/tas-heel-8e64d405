/**
 * 21B3 — guards for FIRST_OFFLINE_OPEN_AFTER_DOWNLOAD.
 *
 * The offline badge must depend on PDF_READY *and* READER_READY, and a
 * not-ready reader must never trigger a PDF re-download.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

describe("21B3 reader runtime readiness", () => {
  const runtime = read("src/lib/pdf/reader-runtime.ts");

  it("warms every web reader asset (chunk, engine, worker)", () => {
    expect(runtime).toContain("@/components/lessons/PdfViewer");
    expect(runtime).toContain("pdfjs-dist");
    expect(runtime).toContain("pdf.worker.min.mjs?url");
    expect(runtime).toContain("@/components/lessons/BrowserNativePdfDelivery");
  });

  it("treats the Android native renderer as always ready", () => {
    expect(runtime).toContain('renderer === "ANDROID_NATIVE"');
  });

  it("persists readiness per build via the hashed worker url", () => {
    expect(runtime).toContain("writeStamp(marker)");
  });

  it("never touches the PDF bytes while preparing the reader", () => {
    expect(runtime).not.toContain("resolveLessonFile");
    expect(runtime).not.toContain("downloadTextbook");
  });
});

describe("21B3 offline-ready gate in the textbooks sheet", () => {
  const sheet = read("src/components/textbooks/SubjectTextbooksSheet.tsx");

  it("requires both PDF_READY and READER_READY for the offline badge", () => {
    expect(sheet).toContain("const offlineReady = pdfReady && readerReady");
    expect(sheet).toContain("محفوظ للاستخدام دون إنترنت");
  });

  it("offers a reader-only retry that does not re-download the file", () => {
    const idx = sheet.lastIndexOf("تجهيز القارئ");
    const retry = sheet.slice(idx - 220, idx);
    expect(retry).toContain("prepareReader");
    expect(retry).not.toContain("onClick={start}");
  });
});
