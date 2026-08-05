import { LEGACY_FLAT_15COL, LEGACY_FLAT_HEADERS } from "./legacy-flat-15col.ts";
import { TEACHER_FLAT_AR_V0 } from "./teacher-flat-ar-v0.ts";
import { OFFICIAL_FLAT_V0 } from "./official-flat-v0.ts";

export type ImportSchemaId = typeof LEGACY_FLAT_15COL | typeof TEACHER_FLAT_AR_V0 | typeof OFFICIAL_FLAT_V0 | "unknown";
const teacher = ["رمز_السؤال","نص_السؤال","نوع_السؤال","الخيار_١","الخيار_٢","الخيار_٣","الخيار_٤","الخيار_٥","الخيار_٦","رقم_الإجابة_الصحيحة","الإجابات_المقبولة","الشرح","الدرجة","السماح_بالجزئي","رمز_المادة","رمز_الدرس","رابط_الوسائط","نوع_الوسائط","نص_بديل"];
const official = ["question_code","question_text","interaction_type","grading_mode","option_1","option_2","option_3","option_4","option_5","option_6","correct_index","accepted_answers","explanation","stimulus_text","max_score","allow_partial","subject_code","lesson_code","media_url","media_type","media_alt"];

export const normalizeHeader = (value: string) => value.replace(/^\uFEFF/, "").trim().replace(/[A-Z]/g, (c) => c.toLowerCase());

export function detectSchemaFromHeaders(headers: string[]): { schema: ImportSchemaId; column_shift_suspected: boolean } {
  const actual = headers.map(normalizeHeader);
  const same = (expected: readonly string[]) => expected.length === actual.length && expected.every((h, index) => normalizeHeader(h) === actual[index]);

  if (same(teacher)) return { schema: TEACHER_FLAT_AR_V0, column_shift_suspected: false };
  if (same(official)) return { schema: OFFICIAL_FLAT_V0, column_shift_suspected: false };
  if (same(LEGACY_FLAT_HEADERS)) return { schema: LEGACY_FLAT_15COL, column_shift_suspected: false };

  return { schema: "unknown", column_shift_suspected: actual.some((h) => [...teacher, ...official, ...LEGACY_FLAT_HEADERS].includes(h)) };
}

export const CONTRACT_HEADERS = { [TEACHER_FLAT_AR_V0]: teacher, [OFFICIAL_FLAT_V0]: official, [LEGACY_FLAT_15COL]: LEGACY_FLAT_HEADERS } as const;
