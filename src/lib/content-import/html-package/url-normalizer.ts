/**
 * URL and Encoding Normalization module for HTML package security checks.
 */

// Decode HTML entities (numeric hex/dec, named)
export function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  let decoded = str;

  // Named entities
  const entityMap: Record<string, string> = {
    "&colon;": ":",
    "&tab;": "\t",
    "&newline;": "\n",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };

  // Decode numeric entities (hex &#x73; or dec &#115;)
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);?/gi, (_, hex) => {
    const code = parseInt(hex, 16);
    return isNaN(code) ? "" : String.fromCharCode(code);
  });

  decoded = decoded.replace(/&#([0-9]+);?/g, (_, dec) => {
    const code = parseInt(dec, 10);
    return isNaN(code) ? "" : String.fromCharCode(code);
  });

  // Decode named entities
  for (const [entity, char] of Object.entries(entityMap)) {
    decoded = decoded.replace(new RegExp(entity, "gi"), char);
  }

  return decoded;
}

// Strip control characters & zero-width chars
export function stripControlCharacters(str: string): string {
  // Removes \u0000-\u001F, \u007F-\u009F, \u200B (zero-width space), \u00AD (soft hyphen), \uFEFF (BOM)
  return str.replace(/[\u0000-\u001F\u007F-\u009F\u200B\u00AD\uFEFF]/g, "");
}

// Safely decode percent-encoding up to 3 passes, fail-closed if malformed
export function safePercentDecode(str: string): { decoded: string; isValid: boolean } {
  let current = str;
  let passes = 0;

  while (passes < 3 && current.includes("%")) {
    // Check if percent encoding pattern is valid
    if (/%(?![0-9a-fA-F]{2})/i.test(current)) {
      return { decoded: current, isValid: false }; // Malformed percent encoding
    }
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
      passes++;
    } catch {
      return { decoded: current, isValid: false }; // Failed decode
    }
  }

  return { decoded: current, isValid: true };
}

/**
 * Full URL normalization pipeline.
 * Returns normalized string and detected scheme if any.
 */
export function normalizeUrlString(rawUrl: string): {
  normalized: string;
  scheme: string | null;
  isValid: boolean;
} {
  if (typeof rawUrl !== "string") {
    return { normalized: "", scheme: null, isValid: false };
  }

  // 1. Decode HTML entities
  let step = decodeHtmlEntities(rawUrl.trim());

  // 2. Strip control characters
  step = stripControlCharacters(step);

  // 3. Normalize Unicode (NFKC)
  try {
    step = step.normalize("NFKC");
  } catch {
    // ignore if environment lacks NFKC
  }

  // 4. Safe percent-decode
  const percentResult = safePercentDecode(step);
  if (!percentResult.isValid) {
    return { normalized: step, scheme: null, isValid: false };
  }
  step = percentResult.decoded;

  // 5. Remove whitespace / obfuscation around potential scheme
  // e.g. "java\nscript:" -> "javascript:"
  const schemeMatch = step.match(/^([a-z0-9+.-]+[\s]*):/i);
  let scheme: string | null = null;

  if (schemeMatch) {
    scheme = schemeMatch[1].replace(/\s+/g, "").toLowerCase();
    // Reconstruct cleaned string with lowercased scheme
    const rest = step.slice(schemeMatch[0].length);
    step = `${scheme}:${rest}`;
  }

  // Check protocol-relative URL "//..."
  if (step.startsWith("//")) {
    return { normalized: step, scheme: "protocol-relative", isValid: false };
  }

  return { normalized: step, scheme, isValid: true };
}

/**
 * Validate URL against safety policy.
 * Only allows relative paths within package root and approved data:image/... URLs.
 */
export function isUrlSafe(
  rawUrl: string,
  options: { allowDataImage?: boolean } = {}
): { safe: boolean; reason?: string; normalized: string } {
  const norm = normalizeUrlString(rawUrl);

  if (!norm.isValid) {
    return { safe: false, reason: "Malformed or obfuscated URL", normalized: norm.normalized };
  }

  const { normalized, scheme } = norm;

  // Reject protocol-relative URLs
  if (scheme === "protocol-relative" || normalized.startsWith("//")) {
    return { safe: false, reason: "Protocol-relative URLs are rejected", normalized };
  }

  // Reject dangerous schemes
  const forbiddenSchemes = [
    "javascript",
    "vbscript",
    "file",
    "http",
    "https",
    "ftp",
    "blob",
    "about",
    "chrome",
    "android-app",
    "capacitor",
    "ms-appx",
    "view-source",
  ];

  if (scheme) {
    if (forbiddenSchemes.includes(scheme)) {
      return { safe: false, reason: `Forbidden URL scheme: ${scheme}:`, normalized };
    }

    if (scheme === "data") {
      if (options.allowDataImage && /^data:image\/(png|jpeg|webp|gif|svg\+xml);/i.test(normalized)) {
        return { safe: true, normalized };
      }
      return { safe: false, reason: `Forbidden data: URL type`, normalized };
    }

    return { safe: false, reason: `Unregistered URL scheme: ${scheme}:`, normalized };
  }

  // Relative path validation
  // Reject path traversal or leading slash / drive letters
  if (
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    normalized.startsWith("\\") ||
    /^[a-z]:[/\\]/i.test(normalized)
  ) {
    return { safe: false, reason: "Path traversal or non-relative path in URL", normalized };
  }

  return { safe: true, normalized };
}
