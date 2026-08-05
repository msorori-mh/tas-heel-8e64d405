/**
 * Build Content Security Policy header or meta string for interactive HTML packages.
 */
export function buildPackageCsp(scriptHashes: string[] = []): string {
  const scriptSrcParts = ["'self'"];

  for (const hash of scriptHashes) {
    if (hash && !scriptSrcParts.includes(hash)) {
      scriptSrcParts.push(hash);
    }
  }

  const cspDirectives = [
    "default-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "navigate-to 'none'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
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
