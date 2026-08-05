import type { SecurityFinding } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";
import { isUrlSafe } from "./url-normalizer.ts";

/**
 * Scans CSS string content (from .css files, <style> tags, or style="..." attributes).
 */
export function scanCssContent(
  cssCode: string,
  filePath: string
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (!cssCode) return findings;

  // 1. Reject @import rules
  if (/@import\b/i.test(cssCode)) {
    findings.push({
      code: ValidationCodes.CSS_IMPORT_NOT_ALLOWED,
      severity: "error",
      file: filePath,
      snippet: "@import",
      message: "ممنوع استخدام قواعد @import داخل CSS.",
    });
  }

  // 2. Reject behavior: (IE HTC)
  if (/\bbehavior\s*:/i.test(cssCode)) {
    findings.push({
      code: ValidationCodes.FORBIDDEN_CSS_BEHAVIOR,
      severity: "error",
      file: filePath,
      snippet: "behavior:",
      message: "ممنوع استخدام خاصية behavior: في CSS.",
    });
  }

  // 3. Reject -moz-binding
  if (/-moz-binding\s*:/i.test(cssCode)) {
    findings.push({
      code: ValidationCodes.FORBIDDEN_CSS_MOZ_BINDING,
      severity: "error",
      file: filePath,
      snippet: "-moz-binding",
      message: "ممنوع استخدام -moz-binding في CSS.",
    });
  }

  // 4. Reject expression()
  if (/\bexpression\s*\(/i.test(cssCode)) {
    findings.push({
      code: ValidationCodes.FORBIDDEN_CSS_EXPRESSION,
      severity: "error",
      file: filePath,
      snippet: "expression()",
      message: "ممنوع استخدام التعبيرات البرمجية expression() داخل CSS.",
    });
  }

  // 5. Extract and validate all url(...) targets inside CSS
  const urlRegex = /url\s*\(\s*(["']?)([^"')]+)\1\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(cssCode)) !== null) {
    const rawUrl = match[2].trim();
    const urlCheck = isUrlSafe(rawUrl, { allowDataImage: true });

    if (!urlCheck.safe) {
      findings.push({
        code: ValidationCodes.FORBIDDEN_CSS_EXTERNAL_URL,
        severity: "error",
        file: filePath,
        snippet: match[0],
        message: `تم رفض رابط محظور داخل CSS (${urlCheck.reason}): ${rawUrl}`,
      });
    }
  }

  return findings;
}
