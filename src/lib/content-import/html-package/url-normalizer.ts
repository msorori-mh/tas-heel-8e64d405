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

// Safely decode percent-encoding up to 8 passes, fail-closed if malformed
export function safePercentDecode(str: string): { decoded: string; isValid: boolean } {
  let current = str;
  let passes = 0;
  const MAX_DECODE_DEPTH = 8;

  while (passes < MAX_DECODE_DEPTH && current.includes("%")) {
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

  if (passes >= MAX_DECODE_DEPTH && current.includes("%")) {
    return { decoded: current, isValid: false }; // Ambiguous deep percent encoding
  }

  return { decoded: current, isValid: true };
}

/**
 * Full URL normalization pipeline with iterative decoding until stable (max depth 8).
 * Checks scheme after each pass and rejects ambiguous/malformed encodings.
 */
export function normalizeUrlString(rawUrl: string): {
  normalized: string;
  scheme: string | null;
  isValid: boolean;
} {
  if (typeof rawUrl !== "string") {
    return { normalized: "", scheme: null, isValid: false };
  }

  let step = rawUrl.trim();
  let depth = 0;
  const MAX_DECODE_DEPTH = 8;
  let detectedScheme: string | null = null;

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

  while (depth < MAX_DECODE_DEPTH) {
    const prev = step;

    // 1. Decode HTML entities
    step = decodeHtmlEntities(step);

    // 2. Strip control characters
    step = stripControlCharacters(step);

    // 3. Normalize Unicode (NFKC)
    try {
      step = step.normalize("NFKC");
    } catch {
      // ignore
    }

    // Check for malformed percent encoding pattern
    if (/%(?![0-9a-fA-F]{2})/i.test(step)) {
      return { normalized: step, scheme: detectedScheme, isValid: false };
    }

    // 4. Safe percent-decode pass
    if (step.includes("%")) {
      try {
        step = decodeURIComponent(step);
      } catch {
        return { normalized: step, scheme: detectedScheme, isValid: false };
      }
    }

    // 5. Scheme check after each stage
    const schemeMatch = step.match(/^([a-z0-9+.-]+[\s\t\n\r]*):/i);
    if (schemeMatch) {
      const cleanScheme = schemeMatch[1].replace(/[\s\t\n\r]+/g, "").toLowerCase();
      detectedScheme = cleanScheme;
      const rest = step.slice(schemeMatch[0].length);
      step = `${cleanScheme}:${rest}`;
    }

    // Exit immediately if forbidden scheme detected
    if (detectedScheme && forbiddenSchemes.includes(detectedScheme)) {
      return { normalized: step, scheme: detectedScheme, isValid: true };
    }

    // Exit if stable
    if (step === prev) {
      break;
    }

    depth++;
  }

  // Reject ambiguous multi-pass percent encoding if still changing after max depth
  if (depth >= MAX_DECODE_DEPTH && (step.includes("%") || /%[0-9a-fA-F]{2}/i.test(step))) {
    return { normalized: step, scheme: detectedScheme, isValid: false };
  }

  // Check protocol-relative URL "//..."
  if (step.startsWith("//")) {
    return { normalized: step, scheme: "protocol-relative", isValid: false };
  }

  return { normalized: step, scheme: detectedScheme, isValid: true };
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
