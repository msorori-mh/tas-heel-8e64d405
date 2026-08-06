import {
  Atom,
  BookOpen,
  BookText,
  Calculator,
  Compass,
  Dna,
  FlaskConical,
  Globe2,
  Landmark,
  Languages,
  Laptop,
  Moon,
  Palette,
  Ruler,
  Scale,
  Sigma,
  type LucideIcon,
} from "lucide-react";

/**
 * Display-only mapping between a subject name (or its stored `icon` key) and a
 * Lucide icon. Purely presentational — no data or schema is touched.
 * Replaces the old "first letter" avatar that rendered as a bare "ا".
 */
const KEYWORD_ICONS: Array<[RegExp, LucideIcon]> = [
  [/رياضيات|جبر|هندسة رياض|حساب/, Calculator],
  [/إحصاء|احصاء|تفاضل|تكامل/, Sigma],
  [/فيزياء/, Atom],
  [/كيمياء/, FlaskConical],
  [/أحياء|احياء|بيولوج/, Dna],
  [/علوم/, FlaskConical],
  [/جغراف/, Globe2],
  [/تاريخ/, Landmark],
  [/وطني|مواطنة|تربية وطنية/, Scale],
  [/إسلام|اسلام|قرآن|قران|فقه|حديث|توحيد|تجويد|شريعة/, Moon],
  [/إنجليز|انجليز|english/i, Languages],
  [/فرنس|ألمان|الماني/, Languages],
  [/عربية|نحو|صرف|بلاغة|أدب|ادب|مطالعة|إملاء|املاء/, BookText],
  [/حاسوب|حاسب|معلوماتية|برمجة|تقنية/, Laptop],
  [/فنون|رسم|فنية/, Palette],
  [/رسم هندسي|هندسة/, Ruler],
];

const ICON_KEYS: Record<string, LucideIcon> = {
  calculator: Calculator,
  atom: Atom,
  flask: FlaskConical,
  dna: Dna,
  globe: Globe2,
  book: BookOpen,
  bookText: BookText,
  languages: Languages,
  laptop: Laptop,
  landmark: Landmark,
  compass: Compass,
  palette: Palette,
};

export function getSubjectIcon(name: string | null, iconKey?: string | null): LucideIcon {
  if (iconKey && ICON_KEYS[iconKey]) return ICON_KEYS[iconKey];
  const value = (name ?? "").trim();
  for (const [pattern, icon] of KEYWORD_ICONS) {
    if (pattern.test(value)) return icon;
  }
  return BookOpen;
}
