/**
 * SHARED_CURRICULUM_SUBJECT_MAPPING_13C — TCS-2 content code scheme.
 *
 * TCS-2 replaces TCS-1. The only structural change is decisive:
 * **the curriculum track is no longer part of a content code**.
 *
 *   Identity   = subjects.code           (TCS-2, track-independent)
 *   Availability = subject_curriculum_tracks (one subject, many tracks)
 *
 * Scheme (versioned: TCS-2):
 *   subject      sub-{gradeShort}-{subjectNo:003}
 *   group        grp-{gradeShort}-{groupNo:02}
 *   unit         unit-{gradeShort}-{subjectNo:003}-{unitNo:02}
 *   lesson       lesson-{gradeShort}-{subjectNo:003}-{lessonNo:003}
 *   explanation  exp-{gradeShort}-{subjectNo:003}-{lessonNo:003}-{seq:02}
 *   resource     res-{gradeShort}-{subjectNo:003}-{lessonNo:003}-{seq:02}
 *   assessment   asm-{gradeShort}-{subjectNo:003}-{lessonNo:003}-{seq:02}
 *   question     q-{gradeShort}-{subjectNo:003}-{questionNo:05}
 *
 * Invariants (unchanged from TCS-1):
 *  - Codes are independent of the Arabic display name.
 *  - A lesson code does NOT embed its unit.
 *  - A question code does NOT embed a lesson.
 *  - A code that was ever allocated is never reused.
 *
 * Pure data + pure functions — no DB access. Client, server and script safe.
 */

import { TCS1_GRADES, type Tcs1GradeRef } from "./tcs1-master-data.ts";

export const CONTENT_CODE_SCHEME_VERSION = "TCS-2" as const;
export const LEGACY_CODE_SCHEME_VERSION = "TCS-1" as const;

export type Tcs2EntityKind =
  | "subject"
  | "group"
  | "unit"
  | "lesson"
  | "explanation"
  | "resource"
  | "assessment"
  | "question";

export const TCS2_PREFIX: Record<Tcs2EntityKind, string> = {
  subject: "sub",
  group: "grp",
  unit: "unit",
  lesson: "lesson",
  explanation: "exp",
  resource: "res",
  assessment: "asm",
  question: "q",
};

export const TCS2_WIDTH = {
  subjectNo: 3,
  groupNo: 2,
  unitNo: 2,
  lessonNo: 3,
  seq: 2,
  questionNo: 5,
} as const;

export class Tcs2Error extends Error {
  constructor(
    public readonly code: string,
    messageAr: string,
  ) {
    super(messageAr);
    this.name = "Tcs2Error";
  }
}

function pad(value: number, width: number): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new Tcs2Error("TCS2_INVALID_NUMBER", `الرقم التسلسلي غير صالح: ${value}`);
  }
  const text = String(value);
  if (text.length > width) {
    throw new Tcs2Error(
      "TCS2_NUMBER_OVERFLOW",
      `الرقم ${value} يتجاوز السعة المسموحة (${width} خانات) في مخطط ${CONTENT_CODE_SCHEME_VERSION}.`,
    );
  }
  return text.padStart(width, "0");
}

/* ------------------------------------------------------------------ *
 * Master-data resolution — grade only. Tracks are NOT part of a code.
 * ------------------------------------------------------------------ */

export function findGrade(gradeSlug: string): Tcs1GradeRef | null {
  const slug = gradeSlug.trim().toLowerCase();
  return TCS1_GRADES.find((g) => g.gradeSlug === slug) ?? null;
}

export function gradeShortFromSlug(gradeSlug: string): string {
  const grade = findGrade(gradeSlug);
  if (!grade) {
    throw new Tcs2Error(
      "TCS2_UNKNOWN_GRADE",
      `الصف «${gradeSlug}» غير موجود في البيانات المرجعية. الصفوف المعتمدة: ${TCS1_GRADES.map((g) => g.gradeSlug).join(" | ")}.`,
    );
  }
  return grade.gradeShort;
}

/* ------------------------------------------------------------------ *
 * Builders
 * ------------------------------------------------------------------ */

export interface Tcs2Scope {
  gradeSlug: string;
}

function scopePart(scope: Tcs2Scope): string {
  return gradeShortFromSlug(scope.gradeSlug);
}

export function buildSubjectCode(scope: Tcs2Scope, subjectNo: number): string {
  return `sub-${scopePart(scope)}-${pad(subjectNo, TCS2_WIDTH.subjectNo)}`;
}

export function buildGroupCode(scope: Tcs2Scope, groupNo: number): string {
  return `grp-${scopePart(scope)}-${pad(groupNo, TCS2_WIDTH.groupNo)}`;
}

export function buildUnitCode(scope: Tcs2Scope, subjectNo: number, unitNo: number): string {
  return `unit-${scopePart(scope)}-${pad(subjectNo, TCS2_WIDTH.subjectNo)}-${pad(unitNo, TCS2_WIDTH.unitNo)}`;
}

export function buildLessonCode(scope: Tcs2Scope, subjectNo: number, lessonNo: number): string {
  return `lesson-${scopePart(scope)}-${pad(subjectNo, TCS2_WIDTH.subjectNo)}-${pad(lessonNo, TCS2_WIDTH.lessonNo)}`;
}

function buildLessonChildCode(
  prefix: string,
  scope: Tcs2Scope,
  subjectNo: number,
  lessonNo: number,
  seq: number,
): string {
  return `${prefix}-${scopePart(scope)}-${pad(subjectNo, TCS2_WIDTH.subjectNo)}-${pad(lessonNo, TCS2_WIDTH.lessonNo)}-${pad(seq, TCS2_WIDTH.seq)}`;
}

export function buildExplanationCode(
  scope: Tcs2Scope,
  subjectNo: number,
  lessonNo: number,
  seq: number,
): string {
  return buildLessonChildCode("exp", scope, subjectNo, lessonNo, seq);
}

export function buildResourceCode(
  scope: Tcs2Scope,
  subjectNo: number,
  lessonNo: number,
  seq: number,
): string {
  return buildLessonChildCode("res", scope, subjectNo, lessonNo, seq);
}

export function buildAssessmentCode(
  scope: Tcs2Scope,
  subjectNo: number,
  lessonNo: number,
  seq: number,
): string {
  return buildLessonChildCode("asm", scope, subjectNo, lessonNo, seq);
}

export function buildQuestionCode(scope: Tcs2Scope, subjectNo: number, questionNo: number): string {
  return `q-${scopePart(scope)}-${pad(subjectNo, TCS2_WIDTH.subjectNo)}-${pad(questionNo, TCS2_WIDTH.questionNo)}`;
}

/* ------------------------------------------------------------------ *
 * Parsing / validation
 * ------------------------------------------------------------------ */

const GRADE_SHORTS = TCS1_GRADES.map((g) => g.gradeShort).join("|");
const SCOPE_RE = `(${GRADE_SHORTS})`;

export const TCS2_PATTERN: Record<Tcs2EntityKind, RegExp> = {
  subject: new RegExp(`^sub-${SCOPE_RE}-(\\d{3})$`),
  group: new RegExp(`^grp-${SCOPE_RE}-(\\d{2})$`),
  unit: new RegExp(`^unit-${SCOPE_RE}-(\\d{3})-(\\d{2})$`),
  lesson: new RegExp(`^lesson-${SCOPE_RE}-(\\d{3})-(\\d{3})$`),
  explanation: new RegExp(`^exp-${SCOPE_RE}-(\\d{3})-(\\d{3})-(\\d{2})$`),
  resource: new RegExp(`^res-${SCOPE_RE}-(\\d{3})-(\\d{3})-(\\d{2})$`),
  assessment: new RegExp(`^asm-${SCOPE_RE}-(\\d{3})-(\\d{3})-(\\d{2})$`),
  question: new RegExp(`^q-${SCOPE_RE}-(\\d{3})-(\\d{5})$`),
};

export interface ParsedTcs2Code {
  kind: Tcs2EntityKind;
  gradeShort: string;
  gradeSlug: string;
  numbers: number[];
}

export function parseTcs2Code(code: string): ParsedTcs2Code | null {
  const value = code.trim().toLowerCase();
  for (const kind of Object.keys(TCS2_PATTERN) as Tcs2EntityKind[]) {
    const match = TCS2_PATTERN[kind].exec(value);
    if (!match) continue;
    const [, gradeShort, ...rest] = match;
    const grade = TCS1_GRADES.find((g) => g.gradeShort === gradeShort);
    if (!grade) return null;
    return {
      kind,
      gradeShort: gradeShort!,
      gradeSlug: grade.gradeSlug,
      numbers: rest.map((n) => Number(n)),
    };
  }
  return null;
}

export function isTcs2Code(code: string, kind?: Tcs2EntityKind): boolean {
  const parsed = parseTcs2Code(code);
  if (!parsed) return false;
  return kind ? parsed.kind === kind : true;
}

/* ------------------------------------------------------------------ *
 * Allocation — read-only, never reuses a number.
 * ------------------------------------------------------------------ */

export function highestAllocatedNumber(
  existingCodes: readonly string[],
  kind: Tcs2EntityKind,
  scope: Tcs2Scope,
  fixed: readonly number[] = [],
): number {
  const gradeShort = gradeShortFromSlug(scope.gradeSlug);
  const numberIndex = fixed.length;
  let highest = 0;

  for (const code of existingCodes) {
    const parsed = parseTcs2Code(code);
    if (!parsed) continue;
    if (parsed.kind !== kind) continue;
    if (parsed.gradeShort !== gradeShort) continue;
    if (fixed.some((expected, i) => parsed.numbers[i] !== expected)) continue;
    const value = parsed.numbers[numberIndex];
    if (typeof value === "number" && value > highest) highest = value;
  }

  return highest;
}

export function nextAllocatedNumber(
  existingCodes: readonly string[],
  kind: Tcs2EntityKind,
  scope: Tcs2Scope,
  fixed: readonly number[] = [],
): number {
  return highestAllocatedNumber(existingCodes, kind, scope, fixed) + 1;
}

export function allocateTcs2Codes(input: {
  existingCodes: readonly string[];
  kind: Tcs2EntityKind;
  scope: Tcs2Scope;
  fixed?: readonly number[];
  count: number;
}): string[] {
  const { existingCodes, kind, scope, fixed = [], count } = input;
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Tcs2Error("TCS2_INVALID_COUNT", "عدد الأكواد المطلوب يجب أن يكون بين 1 و 500.");
  }

  const start = nextAllocatedNumber(existingCodes, kind, scope, fixed);
  const used = new Set(existingCodes.map((c) => c.trim().toLowerCase()));
  const out: string[] = [];

  for (let i = 0; i < count; i++) {
    const n = start + i;
    const code = buildForKind(kind, scope, [...fixed, n]);
    if (used.has(code)) {
      throw new Tcs2Error("TCS2_CODE_COLLISION", `الكود ${code} مخصص مسبقاً — لا يُعاد استخدامه.`);
    }
    out.push(code);
  }
  return out;
}

export function buildForKind(
  kind: Tcs2EntityKind,
  scope: Tcs2Scope,
  numbers: readonly number[],
): string {
  const n = (i: number): number => {
    const value = numbers[i];
    if (typeof value !== "number") {
      throw new Tcs2Error("TCS2_MISSING_NUMBER", `رقم مفقود في بناء كود ${kind}.`);
    }
    return value;
  };

  switch (kind) {
    case "subject":
      return buildSubjectCode(scope, n(0));
    case "group":
      return buildGroupCode(scope, n(0));
    case "unit":
      return buildUnitCode(scope, n(0), n(1));
    case "lesson":
      return buildLessonCode(scope, n(0), n(1));
    case "explanation":
      return buildExplanationCode(scope, n(0), n(1), n(2));
    case "resource":
      return buildResourceCode(scope, n(0), n(1), n(2));
    case "assessment":
      return buildAssessmentCode(scope, n(0), n(1), n(2));
    case "question":
      return buildQuestionCode(scope, n(0), n(1));
  }
}

/* ------------------------------------------------------------------ *
 * Legacy TCS-1 rejection (13C rule 6)
 * ------------------------------------------------------------------ */

const LEGACY_TRACK_SEGMENT = /^(sub|grp|unit|lesson|exp|res|asm|q)-(g10|g11|g12)-(sanaa|aden|other)-/;

/** true when the code follows the frozen TCS-1 scheme (track inside the code). */
export function isLegacyTcs1Code(code: string): boolean {
  return LEGACY_TRACK_SEGMENT.test(code.trim().toLowerCase());
}

export const LEGACY_CODE_REJECTION_AR =
  "LEGACY_CODE_SCHEME_NOT_ALLOWED: هذا الملف يستخدم أكواد TCS-1 القديمة (تحتوي اسم المسار). حمّل القالب الرسمي الحالي من «مركز الاستيراد» واستخدم أكواد TCS-2.";

/** Throws when a code cannot be used to create new curriculum data. */
export function assertNewContentCodeAllowed(code: string, kind?: Tcs2EntityKind): void {
  const value = code.trim();
  if (!value) return;
  if (isLegacyTcs1Code(value)) {
    throw new Tcs2Error("LEGACY_CODE_SCHEME_NOT_ALLOWED", LEGACY_CODE_REJECTION_AR);
  }
  if (!isTcs2Code(value, kind)) {
    throw new Tcs2Error(
      "TCS2_INVALID_CODE",
      `الكود «${value}» لا يتبع مخطط ${CONTENT_CODE_SCHEME_VERSION} الرسمي.`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Human-readable reference (Arabic) for templates, docs and UI.
 * ------------------------------------------------------------------ */

export const TCS2_RULES_AR: readonly string[] = [
  `نظام الأكواد الرسمي: ${CONTENT_CODE_SCHEME_VERSION} — الأكواد يولّدها النظام ولا ينشئها المشغّل يدوياً.`,
  "الكود لا يحتوي على المسار (صنعاء/عدن): هوية المادة شيء، وتوفّرها في المناهج شيء آخر.",
  "المادة المشتركة تُدخل مرة واحدة وتُربط بأكثر من مسار في عمود track_codes.",
  "الكود مستقل عن الاسم العربي: تغيير الاسم لا يغيّر الكود أبداً.",
  "كود الدرس لا يحتوي على كود الوحدة، لذلك يمكن نقل الدرس بين الوحدات دون تغيير هويته.",
  "كود السؤال لا يحتوي على الدرس، لأنه هوية ثابتة عبر المراجعات والاستهداف.",
  "أي كود سبق تخصيصه لا يُعاد استخدامه لكيان آخر حتى بعد الحذف.",
  `المخطط القديم ${LEGACY_CODE_SCHEME_VERSION} مجمّد: لا يُستخدم لإنشاء محتوى جديد ويُرفض عند الاستيراد.`,
];

export const TCS2_FORMAT_TABLE: ReadonlyArray<{
  kind: Tcs2EntityKind;
  labelAr: string;
  format: string;
  example: string;
}> = [
  { kind: "subject", labelAr: "مادة", format: "sub-{gradeShort}-{subjectNo:003}", example: "sub-g12-001" },
  { kind: "group", labelAr: "مجموعة مواد", format: "grp-{gradeShort}-{groupNo:02}", example: "grp-g12-01" },
  { kind: "unit", labelAr: "وحدة", format: "unit-{gradeShort}-{subjectNo:003}-{unitNo:02}", example: "unit-g12-001-01" },
  { kind: "lesson", labelAr: "درس", format: "lesson-{gradeShort}-{subjectNo:003}-{lessonNo:003}", example: "lesson-g12-001-001" },
  { kind: "explanation", labelAr: "شرح", format: "exp-{gradeShort}-{subjectNo:003}-{lessonNo:003}-{seq:02}", example: "exp-g12-001-001-01" },
  { kind: "resource", labelAr: "مورد", format: "res-{gradeShort}-{subjectNo:003}-{lessonNo:003}-{seq:02}", example: "res-g12-001-001-01" },
  { kind: "assessment", labelAr: "تقييم", format: "asm-{gradeShort}-{subjectNo:003}-{lessonNo:003}-{seq:02}", example: "asm-g12-001-001-01" },
  { kind: "question", labelAr: "سؤال", format: "q-{gradeShort}-{subjectNo:003}-{questionNo:05}", example: "q-g12-001-00007" },
];
