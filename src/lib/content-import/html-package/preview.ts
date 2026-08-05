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
  assetMap?: Record<string, string> // asset path -> data URL or blob URL
): string {
  let html = entryFileContent;

  // 1. Inject CSP Meta tag into <head>
  const cspMeta = generateCspMetaTag(cspHeader);
  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>\n  ${cspMeta}`);
  } else if (html.includes("<HEAD>")) {
    html = html.replace("<HEAD>", `<HEAD>\n  ${cspMeta}`);
  } else {
    html = `${cspMeta}\n${html}`;
  }

  // 2. Inject Client Bridge script into <head>
  const bridgeScriptContent = AppInteractiveResourceBridge.getClientRuntimeBridgeScript(
    resourceCode,
    version,
    sessionNonce
  );
  const bridgeScriptTag = `<script>\n${bridgeScriptContent}\n</script>`;

  if (html.includes("</head>")) {
    html = html.replace("</head>", `  ${bridgeScriptTag}\n</head>`);
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
