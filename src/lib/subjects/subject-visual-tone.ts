/**
 * A small, deterministic accent palette for student subject surfaces.
 *
 * The accents communicate subject identity without turning the catalogue into
 * a rainbow. They are presentation-only: stored subject data is never changed.
 * A valid stored colour is retained as the fallback for subjects outside the
 * known curriculum families.
 */
export type SubjectVisualTone = {
  accent: string;
  soft: string;
  wash: string;
};

const SUBJECT_TONES: Array<{ pattern: RegExp; accent: string }> = [
  { pattern: /قرآن|قران|إسلام|اسلام|فقه|حديث|سيرة|عقيدة|توحيد|تجويد|شريعة/, accent: "#0F766E" },
  { pattern: /عربية|نحو|صرف|بلاغة|أدب|ادب|نصوص|قراءة|إملاء|املاء/, accent: "#4338CA" },
  { pattern: /إنجليز|انجليز|english|فرنس|ألمان|الماني/i, accent: "#0369A1" },
  { pattern: /رياضيات|جبر|هندسة|تفاضل|تكامل|إحصاء|احصاء|حساب/, accent: "#7E22CE" },
  { pattern: /فيزياء/, accent: "#1D4ED8" },
  { pattern: /كيمياء|علوم/, accent: "#0E7490" },
  { pattern: /أحياء|احياء|بيولوج/, accent: "#15803D" },
  { pattern: /تاريخ|جغراف|وطنية|مواطنة/, accent: "#B45309" },
  { pattern: /حاسوب|حاسب|معلوماتية|برمجة|تقنية/, accent: "#334155" },
];

const SAFE_HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_ACCENT = "#4F46E5";

export function getSubjectVisualTone(
  subjectName: string | null | undefined,
  storedColor?: string | null,
): SubjectVisualTone {
  const name = subjectName?.trim() ?? "";
  const mapped = SUBJECT_TONES.find(({ pattern }) => pattern.test(name))?.accent;
  const stored = storedColor?.trim() ?? "";
  const accent = mapped ?? (SAFE_HEX.test(stored) ? stored.toUpperCase() : DEFAULT_ACCENT);

  return {
    accent,
    soft: `${accent}18`,
    wash: `${accent}0A`,
  };
}
