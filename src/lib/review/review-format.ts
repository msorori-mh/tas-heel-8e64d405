/**
 * Quick Review text formatting — reused from Mufadala `src/lib/quickReviewFormat.ts`
 * (classification: COPY_AS_IS). Pure functions, no dependencies, no DB.
 */

const SINGLE_CHUNK_MAX = 220;
const TARGET_CHUNK = 200;
const CHARS_PER_WORD = 5;
const WORDS_PER_MINUTE = 180;

/** Splits a summary into readable chunks, preserving the original text verbatim. */
export function chunkSummary(raw: string): string[] {
  const text = (raw ?? "").trim();
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
  const clean = (text ?? "").trim();
  if (!clean) return 0;
  const words = clean.length / CHARS_PER_WORD;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Guarded percentage helper shared by review progress displays. */
export function reviewPercent(done: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((done / total) * 100);
}
