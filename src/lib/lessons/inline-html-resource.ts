/**
 * CF10-R4b — inline HTML lesson resources.
 *
 * CF10 materializes mind maps (STATIC) and lab experiments (INTERACTIVE) as HTML bodies stored in
 * `lesson_resources.description`, referenced by the already-published in-app scheme
 * `lesson-internal://html/<resource_code>` (see `isValidResourceUrl`). No storage bucket is
 * invented and no `data:` URI is used, so `v3_capability_snapshot` (which drops rows with an empty
 * url) keeps a non-empty, hashable payload while the student runtime renders the very same body.
 *
 * Rendering is fail-closed:
 *  - STATIC (mind map): sandbox with NO scripts at all, CSP `script-src 'none'`.
 *  - INTERACTIVE (experiment): sandbox `allow-scripts` only — no same-origin, no forms, no popups —
 *    and a CSP that forbids every network egress (`connect-src 'none'`, `default-src 'none'`).
 */

export const INLINE_HTML_URL_PREFIX = "lesson-internal://html/";

export type InlineHtmlRenderMode = "STATIC_NO_SCRIPT" | "SANDBOXED_NO_NETWORK";

export function isInlineHtmlResourceUrl(url: string | null | undefined): boolean {
  const value = (url ?? "").trim();
  return value.startsWith(INLINE_HTML_URL_PREFIX) && value.length > INLINE_HTML_URL_PREFIX.length;
}

export function inlineHtmlResourceCode(url: string | null | undefined): string | null {
  if (!isInlineHtmlResourceUrl(url)) return null;
  return (url ?? "").trim().slice(INLINE_HTML_URL_PREFIX.length);
}

/** STATIC html_resource_type => JS-free rendering; anything else => sandboxed, network-free. */
export function inlineHtmlRenderMode(
  htmlResourceType: string | null | undefined,
): InlineHtmlRenderMode {
  return (htmlResourceType ?? "").toUpperCase() === "INTERACTIVE"
    ? "SANDBOXED_NO_NETWORK"
    : "STATIC_NO_SCRIPT";
}

export function inlineHtmlSandbox(mode: InlineHtmlRenderMode): string {
  // No allow-same-origin in either mode: the frame stays in an opaque origin.
  return mode === "SANDBOXED_NO_NETWORK" ? "allow-scripts" : "";
}

export function inlineHtmlCsp(mode: InlineHtmlRenderMode): string {
  const script = mode === "SANDBOXED_NO_NETWORK" ? "'unsafe-inline'" : "'none'";
  return [
    "default-src 'none'",
    `script-src ${script}`,
    "style-src 'unsafe-inline'",
    "img-src data:",
    "font-src data:",
    "media-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** Wraps the stored body in a self-contained, RTL, network-free document for `srcDoc`. */
export function buildInlineHtmlDocument(body: string, mode: InlineHtmlRenderMode): string {
  const csp = inlineHtmlCsp(mode);
  return [
    "<!DOCTYPE html>",
    '<html lang="ar" dir="rtl"><head><meta charset="utf-8" />',
    `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<style>html,body{margin:0;padding:12px;font-family:system-ui,'Cairo',sans-serif;",
    "background:#fff;color:#111;line-height:1.7}img{max-width:100%;height:auto}</style>",
    "</head><body>",
    body ?? "",
    "</body></html>",
  ].join("");
}
