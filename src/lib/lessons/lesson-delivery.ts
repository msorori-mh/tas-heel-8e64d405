/**
 * LESSON_EXTERNAL_PDF_DELIVERY_13F — pure helpers for external lesson delivery.
 *
 * No DB access, no React. Client and server safe.
 */

export const LESSON_DELIVERY_MODES = ["in_app_content", "external_resource"] as const;
export type LessonDeliveryMode = (typeof LESSON_DELIVERY_MODES)[number];

export const DEFAULT_LESSON_DELIVERY_MODE: LessonDeliveryMode = "in_app_content";

export function normalizeDeliveryMode(value: unknown): LessonDeliveryMode {
  return value === "external_resource" ? "external_resource" : DEFAULT_LESSON_DELIVERY_MODE;
}

export function isExternalDelivery(value: unknown): boolean {
  return normalizeDeliveryMode(value) === "external_resource";
}

/* ------------------------------------------------------------------ */
/* Google Drive                                                        */
/* ------------------------------------------------------------------ */

const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com"]);

function safeUrl(raw: string): URL | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export function isDriveUrl(raw: string): boolean {
  const url = safeUrl(raw);
  return !!url && DRIVE_HOSTS.has(url.hostname);
}

/** Extracts the Drive file id from the common share URL shapes. */
export function extractDriveFileId(raw: string): string | null {
  const url = safeUrl(raw);
  if (!url || !DRIVE_HOSTS.has(url.hostname)) return null;

  const byPath = url.pathname.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([^/]+)/);
  if (byPath?.[1]) return byPath[1];

  const byQuery = url.searchParams.get("id");
  if (byQuery) return byQuery;

  return null;
}

/**
 * Returns a URL that renders inside an <iframe> when the resource is a Drive
 * file, otherwise null (the caller then falls back to "open in a new tab").
 */
export function toDrivePreviewUrl(raw: string): string | null {
  const id = extractDriveFileId(raw);
  if (!id) return null;
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
}

/** The link opened in a new tab. Drive links are normalised to /view. */
export function toExternalOpenUrl(raw: string): string | null {
  const url = safeUrl(raw);
  if (!url) return null;
  const id = extractDriveFileId(url.toString());
  if (id) return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
  return url.toString();
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export type ExternalResourceKind = "drive_pdf" | "pdf" | "video" | "link";

export function classifyExternalResource(
  resourceType: string | null | undefined,
  url: string,
): ExternalResourceKind {
  if (isDriveUrl(url)) return "drive_pdf";
  if (resourceType === "pdf" || /\.pdf(?:$|[?#])/i.test(url)) return "pdf";
  if (resourceType === "video") return "video";
  return "link";
}

export function externalResourceCta(kind: ExternalResourceKind): string {
  switch (kind) {
    case "drive_pdf":
    case "pdf":
      return "فتح ملف الدرس (PDF)";
    case "video":
      return "مشاهدة الدرس";
    default:
      return "فتح مصدر الدرس";
  }
}
