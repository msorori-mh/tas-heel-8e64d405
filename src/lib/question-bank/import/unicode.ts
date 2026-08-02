const prohibited = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069\uFDD0-\uFDEF\uFFFE\uFFFF]/;
const arabic = /[٠-٩]/;
const eastern = /[۰-۹]/;
const ascii = /[0-9]/;

export function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").normalize("NFC").trim();
}
export function hasUnsafeUnicode(value: string): boolean {
  return prohibited.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
}
export function mixedNumeralScripts(value: string): boolean {
  return [ascii, arabic, eastern].filter((pattern) => pattern.test(value)).length > 1;
}
export function normalizeNumeric(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text || mixedNumeralScripts(text)) return null;
  return text.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace("٫", ".");
}
export function isFormulaLike(value: unknown): boolean {
  return /^[\s]*[=+\-@\t\r]/.test(String(value ?? ""));
}
