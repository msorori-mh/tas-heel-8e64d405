import { computeSha256 } from "./content-hash.ts";
import type { HtmlScanResult, HtmlScriptInfo, SecurityFinding } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";

/**
 * Parses HTML string content safely to extract inline scripts, script hashes, referenced assets, and detect inline handlers / forbidden tags.
 */
export async function parseHtmlContent(
  htmlContent: string,
  filePath = "index.html"
): Promise<HtmlScanResult> {
  const findings: SecurityFinding[] = [];
  const inlineScripts: HtmlScriptInfo[] = [];
  const scriptHashes: string[] = [];
  const referencedAssets = new Set<string>();

  // Extract title
  const titleMatch = htmlContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  // 1. Detect inline event handlers (e.g. onclick, onload, onerror, onmouseover)
  const inlineHandlerRegex = /\s(on[a-z]{3,20})\s*=\s*(["'])([\s\S]*?)\2/gi;
  let match: RegExpExecArray | null;

  while ((match = inlineHandlerRegex.exec(htmlContent)) !== null) {
    const handlerAttr = match[1];
    const snippet = match[0].trim();
    findings.push({
      code: ValidationCodes.INLINE_EVENT_HANDLER_DETECTED,
      severity: "error",
      file: filePath,
      snippet: snippet.length > 80 ? snippet.slice(0, 80) + "..." : snippet,
      message: `تم رفض سمة الحدث الضمني المضمن (Inline event handler): ${handlerAttr}`,
    });
  }

  // 2. Detect javascript: URLs
  const jsUrlRegex = /(href|src|action|data)\s*=\s*(["'])javascript:[\s\S]*?\2/gi;
  while ((match = jsUrlRegex.exec(htmlContent)) !== null) {
    findings.push({
      code: ValidationCodes.JAVASCRIPT_URL_DETECTED,
      severity: "error",
      file: filePath,
      snippet: match[0].trim(),
      message: "تم رفض استخدام روابط javascript: الحركية.",
    });
  }

  // 3. Detect <iframe> tags inside imported HTML
  const iframeRegex = /<iframe[\s\S]*?>/gi;
  if (iframeRegex.test(htmlContent)) {
    findings.push({
      code: ValidationCodes.FORBIDDEN_IFRAME_ELEMENT,
      severity: "error",
      file: filePath,
      message: "ممنوع تضمين عنصر <iframe> داخل ملفات HTML المستوردة.",
    });
  }

  // 4. Detect <form> tags inside imported HTML
  const formRegex = /<form[\s\S]*?>/gi;
  if (formRegex.test(htmlContent)) {
    findings.push({
      code: ValidationCodes.FORBIDDEN_FORM_SUBMISSION,
      severity: "error",
      file: filePath,
      message: "ممنوع تضمين نماذج <form> داخل ملفات HTML المستوردة.",
    });
  }

  // 5. Extract script tags and calculate SHA-256 for inline scripts
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    const attributes = match[1];
    const scriptBody = match[2];

    const srcMatch = attributes.match(/\bsrc\s*=\s*(["'])([\s\S]*?)\1/i);

    if (srcMatch) {
      const srcUrl = srcMatch[2].trim();
      if (srcUrl) {
        referencedAssets.add(srcUrl);
        inlineScripts.push({
          type: "external",
          src: srcUrl,
        });
      }
    } else {
      // Inline script body
      const cleanBody = scriptBody;
      const sha256 = await computeSha256(cleanBody);
      const hashFormatted = `'sha256-${sha256}'`;

      inlineScripts.push({
        type: "inline",
        content: cleanBody,
        sha256: hashFormatted,
      });
      scriptHashes.push(hashFormatted);
    }
  }

  // 6. Extract referenced asset URLs from <link href="...">, <img src="...">, <source src="...">, url(...)
  const assetTagsRegex = /<(link|img|audio|video|source)\b[^>]*?\b(href|src)\s*=\s*(["'])([\s\S]*?)\3/gi;
  while ((match = assetTagsRegex.exec(htmlContent)) !== null) {
    const assetUrl = match[4].trim();
    if (assetUrl && !assetUrl.startsWith("data:") && !assetUrl.startsWith("blob:")) {
      referencedAssets.add(assetUrl);
    }
  }

  // Extract url(...) in inline styles
  const cssUrlRegex = /url\s*\(\s*(["']?)([^"')]+)\1\s*\)/gi;
  while ((match = cssUrlRegex.exec(htmlContent)) !== null) {
    const assetUrl = match[2].trim();
    if (assetUrl && !assetUrl.startsWith("data:") && !assetUrl.startsWith("blob:")) {
      referencedAssets.add(assetUrl);
    }
  }

  return {
    title,
    inlineScripts,
    scriptHashes,
    referencedAssets: Array.from(referencedAssets),
    findings,
  };
}
