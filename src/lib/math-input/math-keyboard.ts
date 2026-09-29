export type ScienceInputProfile = "math" | "physics" | "chemistry" | "biology" | "generic";

export type MathKeyGroup =
  | "basic"
  | "functions"
  | "relations"
  | "calculus"
  | "geometry"
  | "sets"
  | "physics"
  | "chemistry"
  | "biology"
  | "units";

export type MathKey = {
  id: string;
  label: string;
  insert: string;
  cursorOffset?: number;
  group: MathKeyGroup;
  profiles?: ScienceInputProfile[];
  ariaLabel?: string;
};

export const MATH_GROUP_LABELS: Record<MathKeyGroup, string> = {
  basic: "أساسيات",
  functions: "الدوال",
  relations: "العلاقات",
  calculus: "التفاضل والتكامل",
  geometry: "الهندسة",
  sets: "المجموعات",
  physics: "الفيزياء",
  chemistry: "الكيمياء",
  biology: "الأحياء والوراثة",
  units: "الوحدات",
};

const SUBJECT_PROFILES: Array<{ profile: ScienceInputProfile; pattern: RegExp }> = [
  { profile: "math", pattern: /رياضيات|جبر|هندسة|تفاضل|تكامل|احتمال|إحصاء/i },
  { profile: "physics", pattern: /فيزياء/i },
  { profile: "chemistry", pattern: /كيمياء/i },
  { profile: "biology", pattern: /أحياء|احياء|وراثة/i },
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
  const profile = scienceInputProfile(input.subjectName);
  if (profile && profile !== "biology") return true;
  const question = (input.questionText ?? "").toLowerCase();
  const type = (input.questionType ?? "").toUpperCase();
  if (/NUMERIC|MATH|FORMULA|EQUATION|CALCULATION/.test(type)) return true;
  return /[=<>√π∞≤≥²³∫∑]|لوغاريتم|جيب|جيب تمام|ظل|أس\b|تربيع|تكعيب|جذر|معادلة|احسب|أوجد|اوجد|حل |تفاضل|تكامل|نهاية|زاوية|متجه|شحنة|مول|تركيز|وراثة/.test(
    question,
  );
}

const mathPhysics = ["math", "physics"] satisfies ScienceInputProfile[];
const science = ["math", "physics", "chemistry", "biology"] satisfies ScienceInputProfile[];
const physicsChemistry = ["physics", "chemistry"] satisfies ScienceInputProfile[];

export const MATH_KEYS: MathKey[] = [
  { id: "equals", label: "=", insert: "=", group: "basic", ariaLabel: "يساوي" },
  { id: "less", label: "<", insert: "<", group: "basic", ariaLabel: "أصغر من" },
  { id: "greater", label: ">", insert: ">", group: "basic", ariaLabel: "أكبر من" },
  { id: "square", label: "²", insert: "²", group: "basic", ariaLabel: "تربيع" },
  { id: "cube", label: "³", insert: "³", group: "basic", ariaLabel: "تكعيب" },
  {
    id: "root",
    label: "√",
    insert: "√()",
    cursorOffset: -1,
    group: "basic",
    ariaLabel: "جذر تربيعي",
  },
  {
    id: "fraction",
    label: "كسر",
    insert: "()/()",
    cursorOffset: -4,
    group: "basic",
    ariaLabel: "كسر بسط ومقام",
  },
  { id: "open-paren", label: "(", insert: "(", group: "basic", ariaLabel: "قوس فتح" },
  { id: "close-paren", label: ")", insert: ")", group: "basic", ariaLabel: "قوس إغلاق" },
  { id: "open-bracket", label: "[", insert: "[", group: "basic", ariaLabel: "قوس مربع فتح" },
  { id: "close-bracket", label: "]", insert: "]", group: "basic", ariaLabel: "قوس مربع إغلاق" },
  { id: "open-brace", label: "{", insert: "{", group: "basic", ariaLabel: "قوس مجموعة فتح" },
  { id: "close-brace", label: "}", insert: "}", group: "basic", ariaLabel: "قوس مجموعة إغلاق" },
  { id: "plus-minus", label: "±", insert: "±", group: "basic", ariaLabel: "زائد أو ناقص" },
  { id: "times", label: "×", insert: "×", group: "basic", ariaLabel: "ضرب" },
  { id: "divide", label: "÷", insert: "÷", group: "basic", ariaLabel: "قسمة" },
  { id: "percent", label: "%", insert: "%", group: "basic", ariaLabel: "نسبة مئوية" },
  {
    id: "pi",
    label: "ط",
    insert: "ط",
    group: "basic",
    profiles: mathPhysics,
    ariaLabel: "ط، النسبة التقريبية",
  },

  { id: "sup0", label: "⁰", insert: "⁰", group: "basic" },
  { id: "sup1", label: "¹", insert: "¹", group: "basic" },
  { id: "sup4", label: "⁴", insert: "⁴", group: "basic" },
  { id: "sup5", label: "⁵", insert: "⁵", group: "basic" },
  { id: "sup6", label: "⁶", insert: "⁶", group: "basic" },
  { id: "sup7", label: "⁷", insert: "⁷", group: "basic" },
  { id: "sup8", label: "⁸", insert: "⁸", group: "basic" },
  { id: "sup9", label: "⁹", insert: "⁹", group: "basic" },
  { id: "sup-n", label: "ⁿ", insert: "ⁿ", group: "basic", ariaLabel: "أس نون" },

  { id: "sub0", label: "₀", insert: "₀", group: "basic", profiles: science },
  { id: "sub1", label: "₁", insert: "₁", group: "basic", profiles: science },
  { id: "sub2", label: "₂", insert: "₂", group: "basic", profiles: science },
  { id: "sub3", label: "₃", insert: "₃", group: "basic", profiles: science },
  { id: "sub4", label: "₄", insert: "₄", group: "basic", profiles: science },
  { id: "sub5", label: "₅", insert: "₅", group: "basic", profiles: science },
  { id: "sub6", label: "₆", insert: "₆", group: "basic", profiles: science },
  { id: "sub7", label: "₇", insert: "₇", group: "basic", profiles: science },
  { id: "sub8", label: "₈", insert: "₈", group: "basic", profiles: science },
  { id: "sub9", label: "₉", insert: "₉", group: "basic", profiles: science },

  { id: "lte", label: "≤", insert: "≤", group: "relations", ariaLabel: "أصغر من أو يساوي" },
  { id: "gte", label: "≥", insert: "≥", group: "relations", ariaLabel: "أكبر من أو يساوي" },
  { id: "neq", label: "≠", insert: "≠", group: "relations", ariaLabel: "لا يساوي" },
  { id: "approx", label: "≈", insert: "≈", group: "relations", ariaLabel: "تقريباً يساوي" },
  {
    id: "proportional",
    label: "∝",
    insert: "∝",
    group: "relations",
    profiles: mathPhysics,
    ariaLabel: "يتناسب مع",
  },
  {
    id: "therefore",
    label: "∴",
    insert: "∴",
    group: "relations",
    profiles: ["math"],
    ariaLabel: "إذن",
  },
  {
    id: "because",
    label: "∵",
    insert: "∵",
    group: "relations",
    profiles: ["math"],
    ariaLabel: "لأن",
  },

  {
    id: "sin-ar",
    label: "جا",
    insert: "جا()",
    cursorOffset: -1,
    group: "functions",
    profiles: mathPhysics,
    ariaLabel: "جيب",
  },
  {
    id: "cos-ar",
    label: "جتا",
    insert: "جتا()",
    cursorOffset: -1,
    group: "functions",
    profiles: mathPhysics,
    ariaLabel: "جيب تمام",
  },
  {
    id: "tan-ar",
    label: "ظا",
    insert: "ظا()",
    cursorOffset: -1,
    group: "functions",
    profiles: mathPhysics,
    ariaLabel: "ظل",
  },
  {
    id: "cot-ar",
    label: "ظتا",
    insert: "ظتا()",
    cursorOffset: -1,
    group: "functions",
    profiles: ["math"],
    ariaLabel: "ظل تمام",
  },
  {
    id: "sec-ar",
    label: "قا",
    insert: "قا()",
    cursorOffset: -1,
    group: "functions",
    profiles: ["math"],
    ariaLabel: "قاطع",
  },
  {
    id: "csc-ar",
    label: "قتا",
    insert: "قتا()",
    cursorOffset: -1,
    group: "functions",
    profiles: ["math"],
    ariaLabel: "قاطع تمام",
  },
  {
    id: "log-ar",
    label: "لو",
    insert: "لو()",
    cursorOffset: -1,
    group: "functions",
    profiles: mathPhysics,
    ariaLabel: "لوغاريتم",
  },
  {
    id: "log-base-ar",
    label: "لوₐ",
    insert: "لو_()()",
    cursorOffset: -3,
    group: "functions",
    profiles: ["math"],
    ariaLabel: "لوغاريتم لأساس",
  },
  {
    id: "ln-ar",
    label: "لو هـ",
    insert: "لو هـ()",
    cursorOffset: -1,
    group: "functions",
    profiles: mathPhysics,
    ariaLabel: "لوغاريتم طبيعي",
  },
  {
    id: "abs",
    label: "|س|",
    insert: "||",
    cursorOffset: -1,
    group: "functions",
    profiles: mathPhysics,
    ariaLabel: "قيمة مطلقة",
  },
  {
    id: "exp-e",
    label: "هـˣ",
    insert: "هـ^()",
    cursorOffset: -1,
    group: "functions",
    profiles: ["math"],
    ariaLabel: "الدالة الأسية هـ",
  },

  {
    id: "limit",
    label: "نها",
    insert: "نها()",
    cursorOffset: -1,
    group: "calculus",
    profiles: ["math"],
    ariaLabel: "نهاية",
  },
  {
    id: "derivative",
    label: "د/دس",
    insert: "د()/دس",
    cursorOffset: -4,
    group: "calculus",
    profiles: ["math"],
    ariaLabel: "مشتقة بالنسبة لسين",
  },
  {
    id: "integral",
    label: "∫",
    insert: "∫",
    group: "calculus",
    profiles: mathPhysics,
    ariaLabel: "تكامل",
  },
  {
    id: "sum",
    label: "∑",
    insert: "∑",
    group: "calculus",
    profiles: mathPhysics,
    ariaLabel: "مجموع",
  },
  {
    id: "partial",
    label: "∂",
    insert: "∂",
    group: "calculus",
    profiles: mathPhysics,
    ariaLabel: "مشتقة جزئية",
  },
  {
    id: "infinity",
    label: "∞",
    insert: "∞",
    group: "calculus",
    profiles: mathPhysics,
    ariaLabel: "مالانهاية",
  },
  {
    id: "negative-infinity",
    label: "−∞",
    insert: "−∞",
    group: "calculus",
    profiles: mathPhysics,
    ariaLabel: "سالب مالانهاية",
  },
  {
    id: "delta",
    label: "Δ",
    insert: "Δ",
    group: "calculus",
    profiles: science,
    ariaLabel: "دلتا، التغير",
  },

  {
    id: "angle",
    label: "∠",
    insert: "∠",
    group: "geometry",
    profiles: mathPhysics,
    ariaLabel: "زاوية",
  },
  {
    id: "degree",
    label: "°",
    insert: "°",
    group: "geometry",
    profiles: science,
    ariaLabel: "درجة",
  },
  {
    id: "parallel",
    label: "∥",
    insert: "∥",
    group: "geometry",
    profiles: ["math"],
    ariaLabel: "يوازي",
  },
  {
    id: "perpendicular",
    label: "⊥",
    insert: "⊥",
    group: "geometry",
    profiles: ["math"],
    ariaLabel: "عمودي على",
  },
  {
    id: "congruent",
    label: "≅",
    insert: "≅",
    group: "geometry",
    profiles: ["math"],
    ariaLabel: "يطابق",
  },
  {
    id: "similar",
    label: "∼",
    insert: "∼",
    group: "geometry",
    profiles: ["math"],
    ariaLabel: "يشابه",
  },
  {
    id: "triangle",
    label: "△",
    insert: "△",
    group: "geometry",
    profiles: ["math"],
    ariaLabel: "مثلث",
  },
  {
    id: "vector",
    label: "متجه →",
    insert: "→",
    group: "geometry",
    profiles: mathPhysics,
    ariaLabel: "متجه",
  },
  {
    id: "dot-product",
    label: "·",
    insert: "·",
    group: "geometry",
    profiles: mathPhysics,
    ariaLabel: "ضرب قياسي",
  },

  {
    id: "belongs",
    label: "∈",
    insert: "∈",
    group: "sets",
    profiles: ["math"],
    ariaLabel: "ينتمي إلى",
  },
  {
    id: "not-belongs",
    label: "∉",
    insert: "∉",
    group: "sets",
    profiles: ["math"],
    ariaLabel: "لا ينتمي إلى",
  },
  {
    id: "subset",
    label: "⊂",
    insert: "⊂",
    group: "sets",
    profiles: ["math"],
    ariaLabel: "مجموعة جزئية",
  },
  {
    id: "subset-eq",
    label: "⊆",
    insert: "⊆",
    group: "sets",
    profiles: ["math"],
    ariaLabel: "مجموعة جزئية أو تساوي",
  },
  { id: "union", label: "∪", insert: "∪", group: "sets", profiles: ["math"], ariaLabel: "اتحاد" },
  {
    id: "intersection",
    label: "∩",
    insert: "∩",
    group: "sets",
    profiles: ["math"],
    ariaLabel: "تقاطع",
  },
  {
    id: "empty-set",
    label: "∅",
    insert: "∅",
    group: "sets",
    profiles: ["math"],
    ariaLabel: "المجموعة الخالية",
  },
  {
    id: "real",
    label: "حقيقية ℝ",
    insert: "ℝ",
    group: "sets",
    profiles: ["math"],
    ariaLabel: "مجموعة الأعداد الحقيقية",
  },
  {
    id: "natural",
    label: "طبيعية ℕ",
    insert: "ℕ",
    group: "sets",
    profiles: ["math"],
    ariaLabel: "مجموعة الأعداد الطبيعية",
  },
  {
    id: "integer",
    label: "صحيحة ℤ",
    insert: "ℤ",
    group: "sets",
    profiles: ["math"],
    ariaLabel: "مجموعة الأعداد الصحيحة",
  },
  {
    id: "rational",
    label: "نسبية ℚ",
    insert: "ℚ",
    group: "sets",
    profiles: ["math"],
    ariaLabel: "مجموعة الأعداد النسبية",
  },

  {
    id: "theta",
    label: "θ",
    insert: "θ",
    group: "physics",
    profiles: mathPhysics,
    ariaLabel: "ثيتا",
  },
  {
    id: "alpha",
    label: "α",
    insert: "α",
    group: "physics",
    profiles: ["physics"],
    ariaLabel: "ألفا",
  },
  {
    id: "beta",
    label: "β",
    insert: "β",
    group: "physics",
    profiles: ["physics"],
    ariaLabel: "بيتا",
  },
  {
    id: "gamma",
    label: "γ",
    insert: "γ",
    group: "physics",
    profiles: ["physics"],
    ariaLabel: "جاما",
  },
  {
    id: "lambda",
    label: "λ",
    insert: "λ",
    group: "physics",
    profiles: physicsChemistry,
    ariaLabel: "لامبدا",
  },
  {
    id: "mu",
    label: "μ",
    insert: "μ",
    group: "physics",
    profiles: physicsChemistry,
    ariaLabel: "ميو",
  },
  { id: "rho", label: "ρ", insert: "ρ", group: "physics", profiles: ["physics"], ariaLabel: "رو" },
  {
    id: "sigma",
    label: "σ",
    insert: "σ",
    group: "physics",
    profiles: ["physics"],
    ariaLabel: "سيجما",
  },
  {
    id: "omega",
    label: "ω",
    insert: "ω",
    group: "physics",
    profiles: ["physics"],
    ariaLabel: "أوميجا",
  },
  {
    id: "omega-cap",
    label: "Ω",
    insert: "Ω",
    group: "physics",
    profiles: ["physics"],
    ariaLabel: "أوم",
  },
  { id: "phi", label: "φ", insert: "φ", group: "physics", profiles: ["physics"], ariaLabel: "فاي" },
  {
    id: "scientific",
    label: "×١٠ⁿ",
    insert: "×١٠^()",
    cursorOffset: -1,
    group: "physics",
    profiles: physicsChemistry,
    ariaLabel: "الصيغة العلمية ضرب عشرة أس",
  },

  {
    id: "reaction",
    label: "→",
    insert: "→",
    group: "chemistry",
    profiles: ["chemistry", "biology"],
    ariaLabel: "ينتج أو يتجه إلى",
  },
  {
    id: "equilibrium",
    label: "⇌",
    insert: "⇌",
    group: "chemistry",
    profiles: ["chemistry"],
    ariaLabel: "اتزان عكسي",
  },
  {
    id: "gas-up",
    label: "↑",
    insert: "↑",
    group: "chemistry",
    profiles: ["chemistry"],
    ariaLabel: "غاز متصاعد",
  },
  {
    id: "precipitate",
    label: "↓",
    insert: "↓",
    group: "chemistry",
    profiles: ["chemistry"],
    ariaLabel: "راسب",
  },
  {
    id: "charge-plus",
    label: "⁺",
    insert: "⁺",
    group: "chemistry",
    profiles: ["chemistry"],
    ariaLabel: "شحنة موجبة",
  },
  {
    id: "charge-minus",
    label: "⁻",
    insert: "⁻",
    group: "chemistry",
    profiles: ["chemistry"],
    ariaLabel: "شحنة سالبة",
  },
  { id: "charge-2-plus", label: "²⁺", insert: "²⁺", group: "chemistry", profiles: ["chemistry"] },
  { id: "charge-3-plus", label: "³⁺", insert: "³⁺", group: "chemistry", profiles: ["chemistry"] },
  { id: "charge-2-minus", label: "²⁻", insert: "²⁻", group: "chemistry", profiles: ["chemistry"] },
  {
    id: "solid",
    label: "(ص)",
    insert: "(ص)",
    group: "chemistry",
    profiles: ["chemistry"],
    ariaLabel: "حالة صلبة",
  },
  {
    id: "liquid",
    label: "(س)",
    insert: "(س)",
    group: "chemistry",
    profiles: ["chemistry"],
    ariaLabel: "حالة سائلة",
  },
  {
    id: "gas",
    label: "(غ)",
    insert: "(غ)",
    group: "chemistry",
    profiles: ["chemistry"],
    ariaLabel: "حالة غازية",
  },
  {
    id: "aqueous",
    label: "(م)",
    insert: "(م)",
    group: "chemistry",
    profiles: ["chemistry"],
    ariaLabel: "محلول مائي",
  },
  {
    id: "electron",
    label: "إلكترون",
    insert: "e⁻",
    group: "chemistry",
    profiles: ["chemistry"],
    ariaLabel: "إلكترون",
  },
  {
    id: "heat",
    label: "تسخين",
    insert: "Δ",
    group: "chemistry",
    profiles: ["chemistry"],
    ariaLabel: "تسخين",
  },

  {
    id: "female",
    label: "أنثى ♀",
    insert: "♀",
    group: "biology",
    profiles: ["biology"],
    ariaLabel: "أنثى",
  },
  {
    id: "male",
    label: "ذكر ♂",
    insert: "♂",
    group: "biology",
    profiles: ["biology"],
    ariaLabel: "ذكر",
  },
  {
    id: "cross",
    label: "تهجين ×",
    insert: "×",
    group: "biology",
    profiles: ["biology"],
    ariaLabel: "تهجين",
  },
  { id: "dna", label: "DNA", insert: "DNA", group: "biology", profiles: ["biology"] },
  { id: "rna", label: "RNA", insert: "RNA", group: "biology", profiles: ["biology"] },
  { id: "atp", label: "ATP", insert: "ATP", group: "biology", profiles: ["biology"] },

  { id: "meter", label: "متر m", insert: "m", group: "units", profiles: ["physics"] },
  { id: "second", label: "ثانية s", insert: "s", group: "units", profiles: ["physics"] },
  { id: "kilogram", label: "كجم kg", insert: "kg", group: "units", profiles: ["physics"] },
  { id: "newton", label: "نيوتن N", insert: "N", group: "units", profiles: ["physics"] },
  { id: "joule", label: "جول J", insert: "J", group: "units", profiles: ["physics"] },
  { id: "watt", label: "واط W", insert: "W", group: "units", profiles: ["physics"] },
  { id: "volt", label: "فولت V", insert: "V", group: "units", profiles: ["physics"] },
  { id: "ampere", label: "أمبير A", insert: "A", group: "units", profiles: ["physics"] },
  { id: "hertz", label: "هرتز Hz", insert: "Hz", group: "units", profiles: ["physics"] },
  {
    id: "celsius",
    label: "°م",
    insert: "°C",
    group: "units",
    profiles: ["physics", "chemistry", "biology"],
    ariaLabel: "درجة مئوية",
  },
  { id: "mole", label: "مول mol", insert: "mol", group: "units", profiles: ["chemistry"] },
  { id: "molar", label: "مولاري M", insert: "M", group: "units", profiles: ["chemistry"] },
  {
    id: "ph",
    label: "الرقم الهيدروجيني pH",
    insert: "pH",
    group: "units",
    profiles: ["chemistry", "biology"],
  },
];

export function keysForScienceProfile(profile: ScienceInputProfile | null): MathKey[] {
  const keys = profile
    ? MATH_KEYS.filter((key) => !key.profiles || key.profiles.includes(profile))
    : MATH_KEYS.filter((key) => ["basic", "relations"].includes(key.group)).slice(0, 24);

  if (profile !== "math") return keys;
  return keys.map((key) =>
    key.id === "delta"
      ? {
          ...key,
          label: "Δ المميز",
          insert: "Δ=ب²−٤أج",
          ariaLabel: "دلتا المميز: ب تربيع ناقص أربعة ألف جيم",
        }
      : key,
  );
}

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
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

function normalizeArabicNumber(value: string): string {
  return value
    .replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit)
    .replace(/٫/g, ".")
    .replace(/−/g, "-")
    .trim();
}

function roundedMathResult(value: number): string {
  if (!Number.isFinite(value)) return "غير معرّف";
  const normalized = Math.abs(value) < 1e-12 ? 0 : value;
  return Number(normalized.toFixed(10)).toString();
}

export function evaluateArabicMathPreview(value: string): string | null {
  const normalized = normalizeArabicNumber(value);
  const match = normalized.match(
    /^(جا|جتا|ظا|ظتا|قا|قتا|لو هـ|لو|√)\s*\(\s*([+-]?\d+(?:\.\d+)?)\s*\)$/,
  );
  if (!match) return null;

  const fn = match[1];
  const input = Number(match[2]);
  if (!Number.isFinite(input)) return null;

  let result: number;
  if (fn === "لو") {
    if (input <= 0) return "غير معرّف";
    result = Math.log10(input);
  } else if (fn === "لو هـ") {
    if (input <= 0) return "غير معرّف";
    result = Math.log(input);
  } else if (fn === "√") {
    if (input < 0) return "غير معرّف";
    result = Math.sqrt(input);
  } else {
    const radians = (input * Math.PI) / 180;
    if (fn === "جا") result = Math.sin(radians);
    else if (fn === "جتا") result = Math.cos(radians);
    else if (fn === "ظا") {
      if (Math.abs(Math.cos(radians)) < 1e-12) return "غير معرّف";
      result = Math.tan(radians);
    } else if (fn === "ظتا") {
      if (Math.abs(Math.sin(radians)) < 1e-12) return "غير معرّف";
      result = Math.cos(radians) / Math.sin(radians);
    } else if (fn === "قا") {
      if (Math.abs(Math.cos(radians)) < 1e-12) return "غير معرّف";
      result = 1 / Math.cos(radians);
    } else {
      if (Math.abs(Math.sin(radians)) < 1e-12) return "غير معرّف";
      result = 1 / Math.sin(radians);
    }
  }

  return roundedMathResult(result);
}

export function mathContextHint(value: string, profile: ScienceInputProfile | null): string | null {
  if (profile === "math" && /Δ/.test(value)) return "قانون المميز: Δ = ب² − ٤أج";
  return null;
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
