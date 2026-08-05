import { computeSha256Base64 } from "./content-hash.ts";
import { AppInteractiveResourceBridge } from "./bridge.ts";

/**
 * Build Content Security Policy header or meta string for interactive HTML packages.
 */
export async function buildPackageCsp(
  scriptHashes: string[] = [],
  resourceCode?: string,
  version?: number,
  nonce?: string
): Promise<string> {
  const scriptSrcParts: string[] = ["'self'"];

  // Include bridge script hash if resource code / version / nonce are provided
  if (resourceCode && version !== undefined && nonce) {
    const bridgeScriptText = AppInteractiveResourceBridge.getClientRuntimeBridgeScript(
      resourceCode,
      version,
      nonce
    );
    const bridgeHash = await computeSha256Base64(bridgeScriptText);
    scriptSrcParts.push(bridgeHash);
  }

  for (const hash of scriptHashes) {
    if (hash && !scriptSrcParts.includes(hash)) {
      // Enforce sha256-Base64 format
      if (hash.startsWith("'sha256-") || hash.startsWith("sha256-")) {
        const formatted = hash.startsWith("'") ? hash : `'${hash}'`;
        scriptSrcParts.push(formatted);
      }
    }
  }

  const cspDirectives = [
    "default-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "img-src 'self' data:",
    "media-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrcParts.join(" ")}`,
    "font-src 'self' data:",
  ];

  return cspDirectives.join("; ");
}

/**
 * Generates an HTML `<meta http-equiv="Content-Security-Policy">` tag string.
 */
export function generateCspMetaTag(cspHeader: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${cspHeader.replace(/"/g, "&quot;")}">`;
}
