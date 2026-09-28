export type ScienceInputProfile = "math" | "physics" | "chemistry" | "generic";

export type MathKey = {
  id: string;
  label: string;
  insert: string;
  cursorOffset?: number;
  group: "basic" | "functions" | "symbols" | "chemistry";
  profiles?: ScienceInputProfile[];
  ariaLabel?: string;
};

const SUBJECT_PROFILES: Array<{ profile: ScienceInputProfile; pattern: RegExp }> = [
  { profile: "math", pattern: /رياضيات|جبر|هندسة|تفاضل|تكامل|احتمال/i },
  { profile: "physics", pattern: /فيزياء/i },
  { profile: "chemistry", pattern: /كيمياء/i },
];

export function scienceInputProfile(subjectName?: string | null): ScienceInputProfile | null {
  const value = (subjectName ?? "").trim();
  return SUBJECT_PROFILES.find((entry) => entry.pattern.test(value))?.profile ?? null;
}

export function shouldOfferMathKeyboard(input: {
  subjectName?: string | null;
  questionText?: string | null;
  questionType?: string | null;
}): boolean {
  if (scienceInputProfile(input.subjectName)) return true;
  const question = (input.questionText ?? "").toLowerCase();
  const type = (input.questionType ?? "").toUpperCase();
  if (/NUMERIC|MATH|FORMULA|EQUATION|CALCULATION/.test(type)) return true;
  return /[=√π∞≤≥²³]|لوغاريتم|لوغاريتمات|جيب|جيب تمام|ظل|أس\b|تربيع|تكعيب|جذر|معادلة|احسب|أوجد|اوجد|حل /.test(
    question,
  );
}

export const MATH_KEYS: MathKey[] = [
  { id: "square", label: "²", insert: "²", group: "basic", ariaLabel: "تربيع" },
  { id: "cube", label: "³", insert: "³", group: "basic", ariaLabel: "تكعيب" },
  {
    id: "power",
    label: "سⁿ",
    insert: "^()",
    cursorOffset: -1,
    group: "basic",
    ariaLabel: "أس",
  },
  {
    id: "sqrt",
    label: "√",
    insert: "√()",
    cursorOffset: -1,
    group: "basic",
    ariaLabel: "جذر تربيعي",
  },
  {
    id: "nth-root",
    label: "ⁿ√",
    insert: "√[]()",
    cursorOffset: -4,
    group: "basic",
    ariaLabel: "جذر من الرتبة ن",
  },
  {
    id: "fraction",
    label: "كسر",
    insert: "()/()",
    cursorOffset: -4,
    group: "basic",
    ariaLabel: "كسر بسط ومقام",
  },
  { id: "pi", label: "π", insert: "π", group: "basic" },
  { id: "plus-minus", label: "±", insert: "±", group: "basic" },
  { id: "times", label: "×", insert: "×", group: "basic" },
  { id: "divide", label: "÷", insert: "÷", group: "basic" },

  {
    id: "log",
    label: "log",
    insert: "log()",
    cursorOffset: -1,
    group: "functions",
    profiles: ["math", "physics"],
  },
  {
    id: "log-base",
    label: "logₐ",
    insert: "log_()()",
    cursorOffset: -3,
    group: "functions",
    profiles: ["math"],
  },
  {
    id: "ln",
    label: "ln",
    insert: "ln()",
    cursorOffset: -1,
    group: "functions",
    profiles: ["math", "physics"],
  },
  {
    id: "sin",
    label: "sin",
    insert: "sin()",
    cursorOffset: -1,
    group: "functions",
    profiles: ["math", "physics"],
  },
  {
    id: "cos",
    label: "cos",
    insert: "cos()",
    cursorOffset: -1,
    group: "functions",
    profiles: ["math", "physics"],
  },
  {
    id: "tan",
    label: "tan",
    insert: "tan()",
    cursorOffset: -1,
    group: "functions",
    profiles: ["math", "physics"],
  },
  {
    id: "abs",
    label: "|س|",
    insert: "||",
    cursorOffset: -1,
    group: "functions",
    profiles: ["math", "physics"],
  },

  { id: "lte", label: "≤", insert: "≤", group: "symbols" },
  { id: "gte", label: "≥", insert: "≥", group: "symbols" },
  { id: "neq", label: "≠", insert: "≠", group: "symbols" },
  { id: "approx", label: "≈", insert: "≈", group: "symbols" },
  {
    id: "infinity",
    label: "∞",
    insert: "∞",
    group: "symbols",
    profiles: ["math", "physics"],
  },
  {
    id: "delta",
    label: "Δ",
    insert: "Δ",
    group: "symbols",
    profiles: ["math", "physics", "chemistry"],
  },
  {
    id: "theta",
    label: "θ",
    insert: "θ",
    group: "symbols",
    profiles: ["math", "physics"],
  },
  {
    id: "lambda",
    label: "λ",
    insert: "λ",
    group: "symbols",
    profiles: ["physics", "chemistry"],
  },
  {
    id: "mu",
    label: "μ",
    insert: "μ",
    group: "symbols",
    profiles: ["physics", "chemistry"],
  },

  { id: "arrow", label: "→", insert: "→", group: "chemistry", profiles: ["chemistry"] },
  {
    id: "equilibrium",
    label: "⇌",
    insert: "⇌",
    group: "chemistry",
    profiles: ["chemistry"],
  },
  { id: "up", label: "↑", insert: "↑", group: "chemistry", profiles: ["chemistry"] },
  { id: "down", label: "↓", insert: "↓", group: "chemistry", profiles: ["chemistry"] },
  { id: "solid", label: "(s)", insert: "(s)", group: "chemistry", profiles: ["chemistry"] },
  {
    id: "liquid",
    label: "(l)",
    insert: "(l)",
    group: "chemistry",
    profiles: ["chemistry"],
  },
  { id: "gas", label: "(g)", insert: "(g)", group: "chemistry", profiles: ["chemistry"] },
  {
    id: "aqueous",
    label: "(aq)",
    insert: "(aq)",
    group: "chemistry",
    profiles: ["chemistry"],
  },
  { id: "sub2", label: "₂", insert: "₂", group: "chemistry", profiles: ["chemistry"] },
  { id: "sub3", label: "₃", insert: "₃", group: "chemistry", profiles: ["chemistry"] },
  {
    id: "charge-plus",
    label: "⁺",
    insert: "⁺",
    group: "chemistry",
    profiles: ["chemistry"],
  },
  {
    id: "charge-minus",
    label: "⁻",
    insert: "⁻",
    group: "chemistry",
    profiles: ["chemistry"],
  },
];

export function keysForScienceProfile(profile: ScienceInputProfile | null): MathKey[] {
  if (!profile) return MATH_KEYS.filter((key) => key.group !== "chemistry").slice(0, 18);
  return MATH_KEYS.filter((key) => !key.profiles || key.profiles.includes(profile));
}

export function insertMathToken(input: {
  value: string;
  start: number;
  end: number;
  key: Pick<MathKey, "insert" | "cursorOffset">;
  maxLength?: number;
}): { value: string; cursor: number } {
  const start = Math.max(0, Math.min(input.start, input.value.length));
  const end = Math.max(start, Math.min(input.end, input.value.length));
  const next = input.value.slice(0, start) + input.key.insert + input.value.slice(end);
  const limited = typeof input.maxLength === "number" ? next.slice(0, input.maxLength) : next;
  const desired = start + input.key.insert.length + (input.key.cursorOffset ?? 0);
  return { value: limited, cursor: Math.max(0, Math.min(desired, limited.length)) };
}
