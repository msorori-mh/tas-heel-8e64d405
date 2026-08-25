/**
 * CF10-R4b — inline HTML lesson resources.
 *
 * CF10 materializes mind maps and lab experiments as INTERACTIVE HTML bodies stored in
 * `lesson_resources.description`, referenced by the already-published in-app scheme
 * `lesson-internal://html/<resource_code>` (see `isValidResourceUrl`). No storage bucket is
 * invented and no `data:` URI is used, so `v3_capability_snapshot` (which drops rows with an empty
 * url) keeps a non-empty, hashable payload while the student runtime renders the very same body.
 *
 * Rendering is fail-closed:
 *  - STATIC (legacy resources only): sandbox with NO scripts at all, CSP `script-src 'none'`.
 *  - INTERACTIVE (mind map / experiment): sandbox `allow-scripts` only — no same-origin, no forms, no popups —
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
  const securityHead = [
    `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
  ].join("");
  const resizeBridge =
    mode === "SANDBOXED_NO_NETWORK"
      ? `<script>(function(){var send=function(){var d=document.documentElement,b=document.body,h=Math.max(d?d.scrollHeight:0,b?b.scrollHeight:0,320);parent.postMessage({type:'tamkeen:inline-height',height:h},'*')};addEventListener('load',send);addEventListener('resize',send);new MutationObserver(send).observe(document.documentElement,{subtree:true,childList:true,attributes:true});setTimeout(send,0);setTimeout(send,250)})();</script>`
      : "";
  const value = body ?? "";

  // Preserve a complete uploaded HTML document (including its embedded styles)
  // while still injecting our stricter CSP and responsive metadata. This keeps
  // textbook, explanation, and summary layouts faithful instead of nesting a
  // second <html> document inside <body>.
  if (/<html[\s>]/i.test(value)) {
    let document = value;
    document = /<head[\s>]/i.test(document)
      ? document.replace(/<head([^>]*)>/i, `<head$1>${securityHead}`)
      : document.replace(/<html([^>]*)>/i, `<html$1><head>${securityHead}</head>`);
    if (resizeBridge) {
      document = /<\/body>/i
        ? document.replace(/<\/body>/i, `${resizeBridge}</body>`)
        : `${document}${resizeBridge}`;
    }
    return document;
  }

  return [
    "<!DOCTYPE html>",
    '<html lang="ar" dir="rtl"><head><meta charset="utf-8" />',
    securityHead,
    "<style>html,body{margin:0;padding:12px;font-family:system-ui,'Cairo',sans-serif;",
    "background:#fff;color:#111;line-height:1.7}img{max-width:100%;height:auto}</style>",
    "</head><body>",
    value,
    resizeBridge,
    "</body></html>",
  ].join("");
}
