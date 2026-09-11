import type { PackageFileItem } from "./types.ts";
import { generateCspMetaTag } from "./csp-builder.ts";
import { AppInteractiveResourceBridge } from "./bridge.ts";

/**
 * Generates a self-contained sandboxed HTML srcdoc string for preview or rendering,
 * with injected CSP meta tag, bridge script, and embedded local assets.
 */
export function generatePreviewHtmlBundle(
  entryFileContent: string,
  scriptHashes: string[],
  cspHeader: string,
  resourceCode: string,
  version: number,
  sessionNonce: string,
  assetMap?: Record<string, string>, // asset path -> data URL or blob URL
): string {
  // The sandbox owns its viewport. Canonicalise it so uploaded HTML cannot disable
  // pinch-to-zoom on mobile with a later `user-scalable=no` declaration.
  const zoomHead = [
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover">',
    "<style data-tamkeen-mobile-zoom>html,body{touch-action:pan-x pan-y pinch-zoom;-webkit-text-size-adjust:100%}img,svg,canvas{max-width:100%;height:auto}</style>",
  ].join("\n  ");
  let html = entryFileContent.replace(
    /<meta\b(?=[^>]*\bname\s*=\s*(?:["']viewport["']|viewport\b))[^>]*>/gi,
    "",
  );

  // 1. Inject CSP Meta tag into <head>
  const cspMeta = generateCspMetaTag(cspHeader);
  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>\n  ${cspMeta}\n  ${zoomHead}`);
  } else if (html.includes("<HEAD>")) {
    html = html.replace("<HEAD>", `<HEAD>\n  ${cspMeta}\n  ${zoomHead}`);
  } else {
    html = `${cspMeta}\n${zoomHead}\n${html}`;
  }

  // 2. Inject Client Bridge script into <head>
  const bridgeScriptContent = AppInteractiveResourceBridge.getClientRuntimeBridgeScript(
    resourceCode,
    version,
    sessionNonce,
  );
  const bridgeScriptTag = `<script>${bridgeScriptContent}</script>`;

  if (html.includes("</head>")) {
    html = html.replace("</head>", `${bridgeScriptTag}\n</head>`);
  } else {
    html = `${bridgeScriptTag}\n${html}`;
  }

  // 3. Replace asset references with data URLs / blob URLs if assetMap provided
  if (assetMap && Object.keys(assetMap).length > 0) {
    for (const [path, url] of Object.entries(assetMap)) {
      const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const attrRegex = new RegExp(`(src|href)=["'](\\./)?${escapedPath}["']`, "gi");
      html = html.replace(attrRegex, `$1="${url}"`);
    }
  }

  return html;
}
