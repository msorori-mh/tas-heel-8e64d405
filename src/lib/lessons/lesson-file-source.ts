/**
 * 18C — source abstraction for lesson file delivery.
 *
 * Pure helpers, no DB / no React. Two sources are supported:
 *   - SUPABASE_PRIVATE_STORAGE : "bucket/path" or a /storage/v1/object/... URL
 *   - DRIVE                    : a Google Drive share link
 * Anything else is treated as a plain remote URL.
 */

import { extractDriveFileId, isDriveUrl } from "./lesson-delivery";

export const LESSON_FILE_SOURCES = ["SUPABASE_PRIVATE_STORAGE", "DRIVE", "REMOTE_URL"] as const;
export type LessonFileSource = (typeof LESSON_FILE_SOURCES)[number];

export const ALLOWED_PRIVATE_BUCKETS = new Set(["lesson-pdfs", "lesson-videos"]);

export type StorageRef = { bucket: string; path: string };

/** Parse a stored URL or path into { bucket, path } when it points to Supabase storage. */
export function parseStorageRef(input: string): StorageRef | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    const [bucket, ...rest] = trimmed.replace(/^\/+/, "").split("/");
    if (!bucket || rest.length === 0) return null;
    return { bucket, path: rest.join("/") };
  }
  try {
    const u = new URL(trimmed);
    const m = u.pathname.match(
      /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+)$/,
    );
    if (!m) return null;
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

export function classifyLessonFileSource(rawUrl: string): LessonFileSource {
  const ref = parseStorageRef(rawUrl);
  if (ref && ALLOWED_PRIVATE_BUCKETS.has(ref.bucket)) return "SUPABASE_PRIVATE_STORAGE";
  if (isDriveUrl(rawUrl)) return "DRIVE";
  return "REMOTE_URL";
}

/**
 * Direct-download endpoint for a Drive file. `drive.usercontent.google.com`
 * returns the bytes (and honours Range) for publicly shared files, unlike the
 * /file/d/<id>/view HTML page.
 */
export function toDriveDownloadUrl(rawUrl: string): string | null {
  const id = extractDriveFileId(rawUrl);
  if (!id) return null;
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`;
}

/** Stable version token for a resource row: row timestamp + optional upstream etag. */
export function buildVersionToken(updatedAt: string | null, upstreamEtag?: string | null): string {
  const base = updatedAt ? String(Date.parse(updatedAt) || 0) : "0";
  const extra = (upstreamEtag ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  return extra ? `${base}-${extra}` : base;
}
