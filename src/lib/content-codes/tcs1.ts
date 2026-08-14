/**
 * OFFICIAL_CONTENT_CODE_SYSTEM_13B — TCS-1 content code scheme.
 *
 * System-owned identifiers: the operator never invents a code. Every code is
 * derived from real master data (grade_slug + track_code) plus a positional
 * number allocated by scanning the codes that already exist.
 *
 * Scheme (versioned: TCS-1):
 *   subject      sub-{gradeShort}-{trackCode}-{subjectNo:003}
 *   group        grp-{gradeShort}-{trackCode}-{groupNo:02}
 *   unit         unit-{gradeShort}-{trackCode}-{subjectNo:003}-{unitNo:02}
 *   lesson       lesson-{gradeShort}-{trackCode}-{subjectNo:003}-{lessonNo:003}
 *   explanation  exp-{gradeShort}-{trackCode}-{subjectNo:003}-{lessonNo:003}-{seq:02}
 *   resource     res-{gradeShort}-{trackCode}-{subjectNo:003}-{lessonNo:003}-{seq:02}
 *   assessment   asm-{gradeShort}-{trackCode}-{subjectNo:003}-{lessonNo:003}-{seq:02}
 *   question     q-{gradeShort}-{trackCode}-{subjectNo:003}-{questionNo:05}
 *
 * Invariants:
 *  - Codes are independent of the Arabic display name and never change with it.
 *  - A lesson code does NOT embed its unit, so a lesson can be moved between
 *    units without losing its identity.
 *  - A question code does NOT embed a lesson, because the question identity
 *    spans revisions and targets.
 *  - A code that was ever allocated is never reused.
 *
 * Pure data + pure functions — no DB access. Client, server and script safe.
 */

import {
  TCS1_GRADES,
  TCS1_TRACKS,
  type Tcs1GradeRef,
  type Tcs1TrackRef,
} from "./tcs1-master-data.ts";

export const CONTENT_CODE_SCHEME_VERSION = "TCS-1" as const;

export type Tcs1EntityKind =
  | "subject"
  | "group"
  | "unit"
  | "lesson"
  | "explanation"
  | "resource"
  | "assessment"
  | "question";

export const TCS1_PREFIX: Record<Tcs1EntityKind, string> = {
  subject: "sub",
  group: "grp",
  unit: "unit",
  lesson: "lesson",
  explanation: "exp",
  resource: "res",
  assessment: "asm",
  question: "q",
};

/** Zero-padding widths, fixed by the scheme version. */
export const TCS1_WIDTH = {
  subjectNo: 3,
  groupNo: 2,
  unitNo: 2,
  lessonNo: 3,
  seq: 2,
  questionNo: 5,
} as const;

export class Tcs1Error extends Error {
  constructor(
    public readonly code: string,
    messageAr: string,
  ) {
    super(messageAr);
    this.name = "Tcs1Error";
  }
}

function pad(value: number, width: number): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new Tcs1Error("TCS1_INVALID_NUMBER", `الرقم التسلسلي غير صالح: ${value}`);
  }
  const text = String(value);
  if (text.length > width) {
    throw new Tcs1Error(
      "TCS1_NUMBER_OVERFLOW",
      `الرقم ${value} يتجاوز السعة المسموحة (${width} خانات) في مخطط ${CONTENT_CODE_SCHEME_VERSION}.`,
    );
  }
  return text.padStart(width, "0");
}

/* ------------------------------------------------------------------ *
 * Master-data resolution — never hard-code a grade or a track.
 * ------------------------------------------------------------------ */

export function findGrade(gradeSlug: string): Tcs1GradeRef | null {
  const slug = gradeSlug.trim().toLowerCase();
  return TCS1_GRADES.find((g) => g.gradeSlug === slug) ?? null;
}

export function findTrack(trackCode: string): Tcs1TrackRef | null {
  const code = trackCode.trim().toLowerCase();
  return TCS1_TRACKS.find((t) => t.trackCode === code) ?? null;
}

/** grade-10 → g10. Fails closed for any slug that is not real master data. */
export function gradeShortFromSlug(gradeSlug: string): string {
  const grade = findGrade(gradeSlug);
  if (!grade) {
    throw new Tcs1Error(
      "TCS1_UNKNOWN_GRADE",
      `الصف «${gradeSlug}» غير موجود في البيانات المرجعية. الصفوف المعتمدة: ${TCS1_GRADES.map((g) => g.gradeSlug).join(" | ")}.`,
    );
  }
  return grade.gradeShort;
}

export function assertTrackCode(trackCode: string): string {
  const track = findTrack(trackCode);
  if (!track) {
    throw new Tcs1Error(
      "TCS1_UNKNOWN_TRACK",
      `المسار «${trackCode}» غير موجود في البيانات المرجعية. المسارات المعتمدة: ${TCS1_TRACKS.map((t) => t.trackCode).join(" | ")}.`,
    );
  }
  return track.trackCode;
}

/* ------------------------------------------------------------------ *
 * Builders
 * ------------------------------------------------------------------ */

export interface Tcs1Scope {
  gradeSlug: string;
  trackCode: string;
}

function scopePart(scope: Tcs1Scope): string {
  return `${gradeShortFromSlug(scope.gradeSlug)}-${assertTrackCode(scope.trackCode)}`;
}

export function buildSubjectCode(scope: Tcs1Scope, subjectNo: number): string {
  return `sub-${scopePart(scope)}-${pad(subjectNo, TCS1_WIDTH.subjectNo)}`;
}

export function buildGroupCode(scope: Tcs1Scope, groupNo: number): string {
  return `grp-${scopePart(scope)}-${pad(groupNo, TCS1_WIDTH.groupNo)}`;
}

export function buildUnitCode(
  scope: Tcs1Scope,
  subjectNo: number,
  unitNo: number,
): string {
  return `unit-${scopePart(scope)}-${pad(subjectNo, TCS1_WIDTH.subjectNo)}-${pad(unitNo, TCS1_WIDTH.unitNo)}`;
}

export function buildLessonCode(
  scope: Tcs1Scope,
  subjectNo: number,
  lessonNo: number,
): string {
  return `lesson-${scopePart(scope)}-${pad(subjectNo, TCS1_WIDTH.subjectNo)}-${pad(lessonNo, TCS1_WIDTH.lessonNo)}`;
}

function buildLessonChildCode(
  prefix: string,
  scope: Tcs1Scope,
  subjectNo: number,
  lessonNo: number,
  seq: number,
): string {
  return `${prefix}-${scopePart(scope)}-${pad(subjectNo, TCS1_WIDTH.subjectNo)}-${pad(lessonNo, TCS1_WIDTH.lessonNo)}-${pad(seq, TCS1_WIDTH.seq)}`;
}

export function buildExplanationCode(
  scope: Tcs1Scope,
  subjectNo: number,
  lessonNo: number,
  seq: number,
): string {
  return buildLessonChildCode("exp", scope, subjectNo, lessonNo, seq);
}

export function buildResourceCode(
  scope: Tcs1Scope,
  subjectNo: number,
  lessonNo: number,
  seq: number,
): string {
  return buildLessonChildCode("res", scope, subjectNo, lessonNo, seq);
}

export function buildAssessmentCode(
  scope: Tcs1Scope,
  subjectNo: number,
  lessonNo: number,
  seq: number,
): string {
  return buildLessonChildCode("asm", scope, subjectNo, lessonNo, seq);
}

export function buildQuestionCode(
  scope: Tcs1Scope,
  subjectNo: number,
  questionNo: number,
): string {
  return `q-${scopePart(scope)}-${pad(subjectNo, TCS1_WIDTH.subjectNo)}-${pad(questionNo, TCS1_WIDTH.questionNo)}`;
}

/* ------------------------------------------------------------------ *
 * Parsing / validation
 * ------------------------------------------------------------------ */

const GRADE_SHORTS = TCS1_GRADES.map((g) => g.gradeShort).join("|");
const TRACK_CODES = TCS1_TRACKS.map((t) => t.trackCode).join("|");
const SCOPE_RE = `(${GRADE_SHORTS})-(${TRACK_CODES})`;

export const TCS1_PATTERN: Record<Tcs1EntityKind, RegExp> = {
  subject: new RegExp(`^sub-${SCOPE_RE}-(\\d{3})$`),
  group: new RegExp(`^grp-${SCOPE_RE}-(\\d{2})$`),
  unit: new RegExp(`^unit-${SCOPE_RE}-(\\d{3})-(\\d{2})$`),
  lesson: new RegExp(`^lesson-${SCOPE_RE}-(\\d{3})-(\\d{3})$`),
  explanation: new RegExp(`^exp-${SCOPE_RE}-(\\d{3})-(\\d{3})-(\\d{2})$`),
  resource: new RegExp(`^res-${SCOPE_RE}-(\\d{3})-(\\d{3})-(\\d{2})$`),
  assessment: new RegExp(`^asm-${SCOPE_RE}-(\\d{3})-(\\d{3})-(\\d{2})$`),
  question: new RegExp(`^q-${SCOPE_RE}-(\\d{3})-(\\d{5})$`),
};

export interface ParsedTcs1Code {
  kind: Tcs1EntityKind;
  gradeShort: string;
  gradeSlug: string;
  trackCode: string;
  /** Positional numbers in scheme order, already parsed as integers. */
  numbers: number[];
}

export function parseTcs1Code(code: string): ParsedTcs1Code | null {
  const value = code.trim().toLowerCase();
  for (const kind of Object.keys(TCS1_PATTERN) as Tcs1EntityKind[]) {
    const match = TCS1_PATTERN[kind].exec(value);
    if (!match) continue;
    const [, gradeShort, trackCode, ...rest] = match;
    const grade = TCS1_GRADES.find((g) => g.gradeShort === gradeShort);
    if (!grade) return null;
    return {
      kind,
      gradeShort: gradeShort!,
      gradeSlug: grade.gradeSlug,
      trackCode: trackCode!,
      numbers: rest.map((n) => Number(n)),
    };
  }
  return null;
}

export function isTcs1Code(code: string, kind?: Tcs1EntityKind): boolean {
  const parsed = parseTcs1Code(code);
  if (!parsed) return false;
  return kind ? parsed.kind === kind : true;
}

/* ------------------------------------------------------------------ *
 * Allocation — read-only. Never reuses a number that already exists.
 * ------------------------------------------------------------------ */

/**
 * Highest positional number already used at `numberIndex` among codes of the
 * given kind that match every fixed prefix number in `fixed`.
 *
 * `existingCodes` must be the full set of codes ever allocated for that kind
 * (including soft-deleted / archived ones) so a code is never reused.
 */
export function highestAllocatedNumber(
  existingCodes: readonly string[],
  kind: Tcs1EntityKind,
  scope: Tcs1Scope,
  fixed: readonly number[] = [],
): number {
  const gradeShort = gradeShortFromSlug(scope.gradeSlug);
  const trackCode = assertTrackCode(scope.trackCode);
  const numberIndex = fixed.length;
  let highest = 0;

  for (const code of existingCodes) {
    const parsed = parseTcs1Code(code);
    if (!parsed) continue;
    if (parsed.kind !== kind) continue;
    if (parsed.gradeShort !== gradeShort || parsed.trackCode !== trackCode) continue;
    if (fixed.some((expected, i) => parsed.numbers[i] !== expected)) continue;
    const value = parsed.numbers[numberIndex];
    if (typeof value === "number" && value > highest) highest = value;
  }

  return highest;
}

export function nextAllocatedNumber(
  existingCodes: readonly string[],
  kind: Tcs1EntityKind,
  scope: Tcs1Scope,
  fixed: readonly number[] = [],
): number {
  return highestAllocatedNumber(existingCodes, kind, scope, fixed) + 1;
}

/**
 * Allocate `count` consecutive codes of one kind. Pure: the caller decides
 * whether to persist them. No DB write, no sequence, no migration required.
 */
export function allocateTcs1Codes(input: {
  existingCodes: readonly string[];
  kind: Tcs1EntityKind;
  scope: Tcs1Scope;
  /** Fixed parent numbers, in scheme order (e.g. [subjectNo] for a lesson). */
  fixed?: readonly number[];
  count: number;
}): string[] {
  const { existingCodes, kind, scope, fixed = [], count } = input;
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Tcs1Error("TCS1_INVALID_COUNT", "عدد الأكواد المطلوب يجب أن يكون بين 1 و 500.");
  }

  const start = nextAllocatedNumber(existingCodes, kind, scope, fixed);
  const used = new Set(existingCodes.map((c) => c.trim().toLowerCase()));
  const out: string[] = [];

  for (let i = 0; i < count; i++) {
    const n = start + i;
    const code = buildForKind(kind, scope, [...fixed, n]);
    if (used.has(code)) {
      throw new Tcs1Error("TCS1_CODE_COLLISION", `الكود ${code} مخصص مسبقاً — لا يُعاد استخدامه.`);
    }
    out.push(code);
  }
  return out;
}

/** Generic builder used by the allocator. `numbers` is in scheme order. */
export function buildForKind(
  kind: Tcs1EntityKind,
  scope: Tcs1Scope,
  numbers: readonly number[],
): string {
  const n = (i: number): number => {
    const value = numbers[i];
    if (typeof value !== "number") {
      throw new Tcs1Error("TCS1_MISSING_NUMBER", `رقم مفقود في بناء كود ${kind}.`);
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

/** Human-readable rule text (Arabic) used by templates, docs and the UI. */
export const TCS1_RULES_AR: readonly string[] = [
  `نظام الأكواد الرسمي: ${CONTENT_CODE_SCHEME_VERSION} — الأكواد يولّدها النظام ولا ينشئها المشغّل يدوياً.`,
  "الكود مستقل عن الاسم العربي: تغيير الاسم لا يغيّر الكود أبداً.",
  "كود الدرس لا يحتوي على كود الوحدة، لذلك يمكن نقل الدرس بين الوحدات دون تغيير هويته.",
  "كود السؤال لا يحتوي على الدرس، لأنه هوية ثابتة عبر المراجعات والاستهداف.",
  "الصف والمسار داخل الكود مأخوذان من البيانات المرجعية الرسمية فقط.",
  "أي كود سبق تخصيصه لا يُعاد استخدامه لكيان آخر حتى بعد الحذف.",
];

export const TCS1_FORMAT_TABLE: ReadonlyArray<{
  kind: Tcs1EntityKind;
  labelAr: string;
  format: string;
  example: string;
}> = [
  { kind: "subject", labelAr: "مادة", format: "sub-{gradeShort}-{trackCode}-{subjectNo:003}", example: "sub-g10-aden-003" },
  { kind: "group", labelAr: "مجموعة مواد", format: "grp-{gradeShort}-{trackCode}-{groupNo:02}", example: "grp-g10-aden-01" },
  { kind: "unit", labelAr: "وحدة", format: "unit-{gradeShort}-{trackCode}-{subjectNo:003}-{unitNo:02}", example: "unit-g10-aden-003-02" },
  { kind: "lesson", labelAr: "درس", format: "lesson-{gradeShort}-{trackCode}-{subjectNo:003}-{lessonNo:003}", example: "lesson-g10-aden-003-004" },
  { kind: "explanation", labelAr: "شرح", format: "exp-{gradeShort}-{trackCode}-{subjectNo:003}-{lessonNo:003}-{seq:02}", example: "exp-g10-aden-003-004-01" },
  { kind: "resource", labelAr: "مورد", format: "res-{gradeShort}-{trackCode}-{subjectNo:003}-{lessonNo:003}-{seq:02}", example: "res-g10-aden-003-004-01" },
  { kind: "assessment", labelAr: "تقييم", format: "asm-{gradeShort}-{trackCode}-{subjectNo:003}-{lessonNo:003}-{seq:02}", example: "asm-g10-aden-003-004-01" },
  { kind: "question", labelAr: "سؤال", format: "q-{gradeShort}-{trackCode}-{subjectNo:003}-{questionNo:05}", example: "q-g10-aden-003-00007" },
];
