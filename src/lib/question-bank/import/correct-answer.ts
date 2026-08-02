/**
 * Excel correct markers → option_code → is_correct → legacy 0-based correct_index.
 * Excel indexes are 1-based. 0-based Excel values are rejected as suspect.
 */

export type OptionInput = { option_code: string; option_text: string };

export type CorrectResolveOk = {
  ok: true;
  option_code: string;
  options: Array<OptionInput & { is_correct: boolean; sort_order: number }>;
  legacy_correct_index_0_based: number;
};

export type CorrectResolveErr = {
  ok: false;
  reason:
    | "EMPTY"
    | "NOT_FOUND"
    | "ZERO_BASED_SUSPECT"
    | "MULTIPLE_NOT_ALLOWED"
    | "MANUAL_NO_INDEX";
};

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

export function normalizeArabicDigits(raw: string): string {
  return [...raw].map((ch) => ARABIC_DIGITS[ch] ?? ch).join("");
}

export function normalizeLf(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

const ARABIC_OPTION_LETTERS: Record<string, number> = {
  أ: 1,
  ا: 1,
  أَ: 1,
  ب: 2,
  ج: 3,
  د: 4,
  ه: 5,
  و: 6,
};

function letterToIndex(letter: string): number | null {
  if (letter.length !== 1) return null;
  if (ARABIC_OPTION_LETTERS[letter] != null) return ARABIC_OPTION_LETTERS[letter]!;
  const u = letter.toUpperCase();
  const code = u.charCodeAt(0);
  if (code < 65 || code > 90) return null;
  return code - 64; // A=1
}

/**
 * Resolve a correct-answer cell against ordered options (display order).
 * @param allowMultiple when false, multiple matches → error
 */
export function resolveCorrectAnswer(
  raw: unknown,
  options: OptionInput[],
  opts?: { allowMultiple?: boolean; manual?: boolean },
): CorrectResolveOk | CorrectResolveErr {
  const allowMultiple = opts?.allowMultiple ?? false;
  const manual = opts?.manual ?? false;

  if (manual && (raw === null || raw === undefined || String(raw).trim() === "")) {
    return { ok: false, reason: "MANUAL_NO_INDEX" };
  }

  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: false, reason: "EMPTY" };
  }

  const text = normalizeLf(normalizeArabicDigits(String(raw)));

  // Explicit 0 → suspect zero-based
  if (text === "0") {
    return { ok: false, reason: "ZERO_BASED_SUSPECT" };
  }

  let matchedCodes: string[] = [];

  // Letter A-D (or beyond)
  const asLetter = letterToIndex(text);
  if (asLetter !== null) {
    const idx = asLetter - 1;
    if (idx >= 0 && idx < options.length) {
      matchedCodes = [options[idx]!.option_code];
    }
  }

  // 1-based numeric index
  if (matchedCodes.length === 0 && /^\d+$/.test(text)) {
    const n = Number(text);
    if (n === 0) return { ok: false, reason: "ZERO_BASED_SUSPECT" };
    const idx = n - 1;
    if (idx >= 0 && idx < options.length) {
      matchedCodes = [options[idx]!.option_code];
    }
  }

  // option_code exact (case-insensitive)
  if (matchedCodes.length === 0) {
    const byCode = options.find(
      (o) => o.option_code.toUpperCase() === text.toUpperCase(),
    );
    if (byCode) matchedCodes = [byCode.option_code];
  }

  // option_text exact match (LF-normalized)
  if (matchedCodes.length === 0) {
    const byText = options.filter(
      (o) => normalizeLf(o.option_text) === text,
    );
    matchedCodes = byText.map((o) => o.option_code);
  }

  if (matchedCodes.length === 0) {
    return { ok: false, reason: "NOT_FOUND" };
  }
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
    legacy_correct_index_0_based: firstCorrect,
  };
}

export function optionCodesFromCount(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}
