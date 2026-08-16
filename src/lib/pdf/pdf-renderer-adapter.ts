/**
 * 18C2 — PdfRendererAdapter.
 *
 * The only new abstraction introduced by 18C2. Everything upstream of it
 * (secure delivery, offline cache, versioning, packs, prefetch) is unchanged:
 * the adapter always receives bytes that the 18C cache already produced.
 *
 * Renderer selection:
 *   - Android (Capacitor native) → ANDROID_NATIVE (android.graphics.pdf,
 *     PDFium) because pdf.js mis-shapes the Arabic subset fonts of the
 *     ministry books.
 *   - Web with a built-in PDF plugin → BROWSER_NATIVE (same engine family as
 *     the desktop/mobile browser's own viewer).
 *   - Otherwise → PDFJS (legacy fallback only).
 */

import { Capacitor } from "@capacitor/core";

export type PdfRendererKind = "ANDROID_NATIVE" | "BROWSER_NATIVE" | "PDFJS";

export function isAndroidNative(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

/** True when the browser ships its own PDF viewer for object/iframe embeds. */
export function browserRendersPdf(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { pdfViewerEnabled?: boolean };
  if (typeof nav.pdfViewerEnabled === "boolean") return nav.pdfViewerEnabled;
  try {
    return Array.from(nav.mimeTypes ?? []).some((m) => m.type === "application/pdf");
  } catch {
    return false;
  }
}

export function selectPdfRenderer(): PdfRendererKind {
  if (isAndroidNative()) return "ANDROID_NATIVE";
  if (browserRendersPdf()) return "BROWSER_NATIVE";
  return "PDFJS";
}
