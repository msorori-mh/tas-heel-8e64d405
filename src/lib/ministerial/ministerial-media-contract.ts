/**
 * MINISTERIAL_QUESTION_MEDIA_V1 — shared media contract.
 *
 * Pure data + pure functions. No DB access, no React, no Node-only APIs.
 * Used by the browser parser, the upload client, the authenticated media
 * endpoint and the test suites. Mirrors the SQL helpers shipped in
 * 20260914010000_ministerial_question_media.sql — keep both in sync.
 */

export const QUESTION_MEDIA_BUCKET = "question-media" as const;

/** Where an image is rendered relative to the question. */
export const MINISTERIAL_MEDIA_PLACEMENTS = [
  "QUESTION",
  "OPTION_A",
  "OPTION_B",
  "OPTION_C",
  "OPTION_D",
  "SOLUTION",
] as const;
export type MinisterialMediaPlacement = (typeof MINISTERIAL_MEDIA_PLACEMENTS)[number];

/** Aden questions are free-text: no option images. */
export const ADEN_MEDIA_PLACEMENTS = ["QUESTION", "SOLUTION"] as const satisfies readonly MinisterialMediaPlacement[];

export const MINISTERIAL_MEDIA_LIMITS = {
  maxImageBytes: 8 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxZipEntries: 1200,
  maxXlsxBytes: 5 * 1024 * 1024,
  maxAltTextChars: 500,
  maxFileNameChars: 200,
  /** A ZIP entry whose declared inflate ratio exceeds this is treated as a bomb. */
  maxCompressionRatio: 60,
} as const;

export const MINISTERIAL_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type MinisterialImageMimeType = (typeof MINISTERIAL_IMAGE_MIME_TYPES)[number];

export const MEDIA_FOLDER = "media/" as const;

const MIME_EXTENSION: Record<MinisterialImageMimeType, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const EXTENSION_MIME: Record<string, MinisterialImageMimeType> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/** Content-addressed object key inside the private `question-media` bucket. */
export const MINISTERIAL_MEDIA_STORAGE_KEY_RE = /^ministerial\/[0-9a-f]{2}\/[0-9a-f]{64}\.(?:png|jpg|webp)$/;

export type MinisterialPackageMedia = {
  placement: MinisterialMediaPlacement;
  /** Original entry name under media/ (informational, ≤200 chars). */
  file_name: string;
  sha256: string;
  mime_type: MinisterialImageMimeType;
  file_size: number;
  alt_text_ar: string;
};

/** Element shape pinned into exam_session_questions.rendered_media. */
export type MinisterialRenderedMedia = {
  media_id: string;
  media_code: string;
  placement: MinisterialMediaPlacement;
  option_code: "A" | "B" | "C" | "D" | null;
  alt_text_ar: string;
  caption: string | null;
  mime_type: string;
  sha256: string | null;
};

export const MEDIA_PLACEMENT_LABEL_AR: Record<MinisterialMediaPlacement, string> = {
  QUESTION: "صورة السؤال",
  OPTION_A: "صورة الخيار أ",
  OPTION_B: "صورة الخيار ب",
  OPTION_C: "صورة الخيار ج",
  OPTION_D: "صورة الخيار د",
  SOLUTION: "صورة الحل",
};

export const MEDIA_PLACEMENT_SORT_ORDER: Record<MinisterialMediaPlacement, number> = {
  QUESTION: 0,
  OPTION_A: 1,
  OPTION_B: 2,
  OPTION_C: 3,
  OPTION_D: 4,
  SOLUTION: 5,
};

export function mediaCodeForPlacement(placement: MinisterialMediaPlacement): string {
  return `MEDIA-${placement}`;
}

export function placementFromMediaCode(mediaCode: string): MinisterialMediaPlacement | null {
  const candidate = mediaCode.startsWith("MEDIA-") ? mediaCode.slice("MEDIA-".length) : "";
  return (MINISTERIAL_MEDIA_PLACEMENTS as readonly string[]).includes(candidate)
    ? (candidate as MinisterialMediaPlacement)
    : null;
}

export function optionCodeForPlacement(
  placement: MinisterialMediaPlacement,
): "A" | "B" | "C" | "D" | null {
  return placement.startsWith("OPTION_") ? (placement.slice("OPTION_".length) as "A" | "B" | "C" | "D") : null;
}

export function isMinisterialImageMime(value: string): value is MinisterialImageMimeType {
  return (MINISTERIAL_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export function extensionForMime(mime: MinisterialImageMimeType): "png" | "jpg" | "webp" {
  return MIME_EXTENSION[mime];
}

export function mimeForExtension(fileName: string): MinisterialImageMimeType | null {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return null;
  return EXTENSION_MIME[fileName.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * Sniff the real image type from magic bytes. SVG and every other format are
 * rejected (returns null). Mirrors nothing in SQL: the browser sniffs, the
 * server only re-checks size/mime of the uploaded object.
 */
export function detectImageMime(bytes: Uint8Array): MinisterialImageMimeType | null {
  if (bytes.length >= 12) {
    // RIFF....WEBP
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
  }
  if (bytes.length >= 8) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return "image/png";
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

/** `ministerial/ab/abcdef…64.png` — identical to public.ministerial_media_storage_key(). */
export function ministerialMediaStorageKey(sha256: string, mime: MinisterialImageMimeType): string {
  const hash = sha256.toLowerCase();
  if (!SHA256_HEX_RE.test(hash)) throw new Error("invalid sha256");
  return `ministerial/${hash.slice(0, 2)}/${hash}.${extensionForMime(mime)}`;
}

/**
 * ZIP entry name hardening: forward slashes only, no absolute paths, no
 * drive letters, no `.`/`..` segments, no control characters, no backslashes.
 */
export function isSafeZipEntryName(name: string): boolean {
  if (!name || name.length > 512) return false;
  if (name.startsWith("/") || name.startsWith("\\")) return false;
  if (/^[A-Za-z]:/.test(name)) return false;
  if (name.includes("\\")) return false;
  // Reject control characters (NUL, C0 range, DEL) without a control-char regex literal.
  for (let index = 0; index < name.length; index += 1) {
    const codePoint = name.charCodeAt(index);
    if (codePoint <= 0x1f || codePoint === 0x7f) return false;
  }
  const segments = name.split("/");
  return segments.every((segment, index) => {
    if (segment === "." || segment === "..") return false;
    // Only the trailing segment of a directory entry may be empty.
    if (segment === "") return index === segments.length - 1 && name.endsWith("/");
    return true;
  });
}

/** Bare file name check for the media/ folder: no nested folders, safe charset. */
export const MEDIA_FILE_NAME_RE = /^[A-Za-z0-9\u0600-\u06FF][A-Za-z0-9\u0600-\u06FF._ \-()]{0,199}\.(?:png|jpg|jpeg|webp)$/i;

export function normalizeMediaFileName(raw: string): string {
  return raw.trim().replace(/^\.?\/?media\//i, "").replace(/\\/g, "/");
}

export function defaultAltText(placement: MinisterialMediaPlacement): string {
  return MEDIA_PLACEMENT_LABEL_AR[placement];
}

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const byte of view) out += byte.toString(16).padStart(2, "0");
  return out;
}

export async function sha256HexOf(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(digest);
}

/** Pick the pinned media for one placement out of a rendered_media array. */
export function mediaForPlacement<T extends { placement: string }>(
  media: readonly T[] | null | undefined,
  placement: MinisterialMediaPlacement,
): T | null {
  return media?.find((item) => item.placement === placement) ?? null;
}

export function formatMediaBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}
