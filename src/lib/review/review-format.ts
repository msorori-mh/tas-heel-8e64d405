/**
 * Quick Review text formatting — reused from Mufadala `src/lib/quickReviewFormat.ts`
 * (classification: COPY_AS_IS). Pure functions, no dependencies, no DB.
 */

const SINGLE_CHUNK_MAX = 220;
const TARGET_CHUNK = 200;
const CHARS_PER_WORD = 5;
const WORDS_PER_MINUTE = 180;

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  laquo: "«",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  raquo: "»",
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_entity, code: string) => {
      const point = code.toLowerCase().startsWith("x")
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : " ";
    })
    .replace(/&([a-z]+);/gi, (_entity, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? " ");
}

/**
 * Converts an authored HTML summary to visible review text without ever rendering
 * the operator HTML. Plain-text summaries keep their paragraph boundaries.
 */
export function toReviewText(raw: string | null | undefined): string {
  const source = (raw ?? "").trim();
  if (!source) return "";

  const looksLikeHtml =
    /<!doctype\s+html|<\/?(?:html|head|body|main|article|section|div|p|h[1-6]|ul|ol|li|br)\b/i.test(
      source,
    );
  const visible = looksLikeHtml
    ? source
        .replace(/<(script|style|template|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<!--([\s\S]*?)-->/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "\n• ")
        .replace(/<\/(?:p|div|li|section|article|main|h[1-6]|ul|ol|tr)>/gi, "\n")
        .replace(/<!doctype[^>]*>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    : source;

  return decodeHtmlEntities(visible)
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Splits a summary into readable chunks, preserving the original text verbatim. */
export function chunkSummary(raw: string): string[] {
  const text = toReviewText(raw);
  if (!text) return [];

  // 1) Honour author paragraphs first.
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;

  // 2) Short enough to read as one card.
  if (text.length <= SINGLE_CHUNK_MAX) return [text];

  // 3) Group sentences greedily to ~TARGET_CHUNK chars.
  //    Arabic terminators included; no lookbehind (older WebView safe).
  const sentences = text.split(/([.!?؟])\s+/).reduce<string[]>((acc, part, index, arr) => {
    if (index % 2 === 0) {
      const terminator = arr[index + 1] ?? "";
      const sentence = (part + terminator).trim();
      if (sentence) acc.push(sentence);
    }
    return acc;
  }, []);

  if (sentences.length === 0) return [text];

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }
    if (current.length + sentence.length + 1 <= TARGET_CHUNK) {
      current = `${current} ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Arabic-tuned reading time estimate, floored at 1 minute for non-empty text. */
export function estimateReadMinutes(text: string): number {
  const clean = toReviewText(text);
  if (!clean) return 0;
  const words = clean.length / CHARS_PER_WORD;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Guarded percentage helper shared by review progress displays. */
export function reviewPercent(done: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((done / total) * 100);
}
