/**
 * 18C2 — JS side of the TamkeenPdfViewer Capacitor plugin.
 *
 * The bridge is intentionally narrow: only an app-private RELATIVE path plus
 * presentation metadata cross it. No Drive URL, no Supabase URL, no JWT.
 */

import { registerPlugin } from "@capacitor/core";

export type NativeOpenOptions = {
  /** Path relative to the app-private data directory (Filesystem Directory.Data). */
  localPath: string;
  resourceId: string;
  title?: string | null;
  initialPage?: number;
};

export type NativeOpenResult = { lastPage: number; closed: boolean };

type TamkeenPdfViewerPlugin = {
  isAvailable: () => Promise<{ available: boolean }>;
  open: (options: {
    localPath: string;
    title?: string;
    initialPage?: number;
  }) => Promise<NativeOpenResult>;
};

export const TamkeenPdfViewer = registerPlugin<TamkeenPdfViewerPlugin>("TamkeenPdfViewer");

/** Guard: the viewer only ever accepts private relative paths. */
export function isPrivateRelativePath(path: string | null | undefined): boolean {
  const value = (path ?? "").trim();
  if (!value) return false;
  if (value.startsWith("/")) return false;
  if (value.includes("..")) return false;
  if (/^[a-z]+:\/\//i.test(value)) return false;
  return true;
}

export async function openNativePdf(options: NativeOpenOptions): Promise<NativeOpenResult> {
  if (!isPrivateRelativePath(options.localPath)) throw new Error("invalid_local_path");
  return TamkeenPdfViewer.open({
    localPath: options.localPath,
    title: options.title?.trim() || "ملف الدرس",
    initialPage: Math.max(1, Math.floor(options.initialPage ?? 1)),
  });
}
