function isProhibitedCodePoint(codePoint: number): boolean {
  return (
    codePoint <= 0x08 ||
    codePoint === 0x0b ||
    codePoint === 0x0c ||
    (codePoint >= 0x0e && codePoint <= 0x1f) ||
    codePoint === 0x7f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    (codePoint >= 0xfdd0 && codePoint <= 0xfdef) ||
    codePoint === 0xfffe ||
    codePoint === 0xffff
  );
}
const arabic = /[٠-٩]/;
const eastern = /[۰-۹]/;
const ascii = /[0-9]/;

/** Only spreadsheet scalar text is accepted; objects must never stringify to "[object Object]". */
export function isScalarText(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
export function normalizeText(value: unknown): string {
  if (!isScalarText(value)) return "";
  return String(value).replace(/\r\n?/g, "\n").normalize("NFC").trim();
}
export function hasUnsafeUnicode(value: string): boolean {
  return (
    Array.from(value).some((character) => isProhibitedCodePoint(character.codePointAt(0) ?? 0)) ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)
  );
}
export function mixedNumeralScripts(value: string): boolean {
  return [ascii, arabic, eastern].filter((pattern) => pattern.test(value)).length > 1;
}
export function normalizeNumeric(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text || mixedNumeralScripts(text)) return null;
  return text
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace("٫", ".");
}
export function isFormulaLike(value: unknown): boolean {
  if (!isScalarText(value)) return false;
  return /^[\s]*[=+\-@\t\r]/.test(String(value));
}
