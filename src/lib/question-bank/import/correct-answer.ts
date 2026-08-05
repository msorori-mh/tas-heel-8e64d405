import { normalizeNumeric, normalizeText } from "./unicode.ts";

export type OptionInput = { option_code: string; body: string };

export type CorrectResolveOk = {
  ok: true;
  option_code: string;
  options: Array<OptionInput & { is_correct: boolean; sort_order: number }>;
  correct_index_0_based: number;
};

export type CorrectResolveErr = {
  ok: false;
  reason:
    | "EMPTY"
    | "NOT_FOUND"
    | "MULTIPLE_NOT_ALLOWED"
    | "EMPTY_OPTION"
    | "INVALID_INDEX";
};

const ARABIC_LETTER_TO_CODE: Record<string, string> = {
  أ: "A",
  ا: "A",
  إ: "A",
  آ: "A",
  ب: "B",
  ج: "C",
  د: "D",
  ه: "E",
  و: "F",
};

export function normalizeArabicDigits(raw: string): string {
  return normalizeNumeric(raw) ?? raw;
}

export function normalizeLf(value: string): string {
  return normalizeText(value);
}

function resolveLetterToCode(text: string): string | null {
  if (text.length !== 1) return null;
  if (ARABIC_LETTER_TO_CODE[text]) return ARABIC_LETTER_TO_CODE[text]!;
  const upper = text.toUpperCase();
  if (upper >= "A" && upper <= "F") return upper;
  return null;
}

/**
 * Resolve a correct-answer marker.
 * - Letters A–F / a–f / Arabic أ–و resolve by option_code (not array position).
 * - Numeric indexes use contract-specific indexBase (1 for teacher/official, 0 for legacy).
 */
export function resolveCorrectAnswer(
  raw: unknown,
  options: OptionInput[],
  opts?: { allowMultiple?: boolean; indexBase?: 0 | 1 },
): CorrectResolveOk | CorrectResolveErr {
  const allowMultiple = opts?.allowMultiple ?? false;
  const indexBase = opts?.indexBase ?? 1;

  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: false, reason: "EMPTY" };
  }

  const text = normalizeLf(String(raw));
  let matchedCodes: string[] = [];

  const letterCode = resolveLetterToCode(text);
  if (letterCode) {
    const byCode = options.find((o) => o.option_code.toUpperCase() === letterCode);
    if (!byCode) return { ok: false, reason: "NOT_FOUND" };
    if (!byCode.body) return { ok: false, reason: "EMPTY_OPTION" };
    matchedCodes = [byCode.option_code];
  }

  if (matchedCodes.length === 0) {
    const numeric = normalizeNumeric(text);
    if (numeric !== null && /^-?\d+(\.\d+)?$/.test(numeric)) {
      if (!/^\d+$/.test(numeric)) return { ok: false, reason: "INVALID_INDEX" };
      const n = Number(numeric);
      const idx = n - indexBase;
      if (!Number.isInteger(n) || idx < 0 || idx >= options.length) {
        return { ok: false, reason: "INVALID_INDEX" };
      }
      const target = options[idx]!;
      if (!target.body) return { ok: false, reason: "EMPTY_OPTION" };
      matchedCodes = [target.option_code];
    }
  }

  if (matchedCodes.length === 0) {
    const byCode = options.find(
      (o) => o.option_code.toUpperCase() === text.toUpperCase(),
    );
    if (byCode) {
      if (!byCode.body) return { ok: false, reason: "EMPTY_OPTION" };
      matchedCodes = [byCode.option_code];
    }
  }

  if (matchedCodes.length === 0) {
    const byText = options.filter((o) => normalizeLf(o.body) === text && o.body);
    matchedCodes = byText.map((o) => o.option_code);
  }

  if (matchedCodes.length === 0) return { ok: false, reason: "NOT_FOUND" };
  if (matchedCodes.length > 1 && !allowMultiple) {
    return { ok: false, reason: "MULTIPLE_NOT_ALLOWED" };
  }

  const correct = new Set(matchedCodes);
  const enriched = options.map((o, i) => ({
    ...o,
    is_correct: correct.has(o.option_code),
    sort_order: i,
  }));
  const firstCorrect = enriched.findIndex((o) => o.is_correct);
  return {
    ok: true,
    option_code: matchedCodes[0]!,
    options: enriched,
    correct_index_0_based: firstCorrect,
  };
}

export function optionCodesFromCount(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}

export function contiguousOptionBodies(values: unknown[]): string[] {
  const bodies = values.map((v) => normalizeText(v ?? ""));
  const firstBlank = bodies.findIndex((b) => !b);
  const compact = firstBlank < 0 ? bodies : bodies.slice(0, firstBlank);
  if (bodies.slice(compact.length).some(Boolean)) return [];
  return compact;
}
