/**
 * PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.2 — ministerial import contract.
 *
 * Pure data + pure functions. No DB access, no React. Client/server/test safe.
 *
 * The ministerial workflow is a SEPARATE namespace from content templates 01–09.
 * Order: M01 → M02 → Review → Publish.
 */

export const MINISTERIAL_IMPORT_ORDER = ["M01", "M02", "REVIEW", "PUBLISH"] as const;
export type MinisterialImportStep = (typeof MINISTERIAL_IMPORT_ORDER)[number];

export const MINISTERIAL_TEMPLATE_KEYS = {
  m01: "M01_ministerial_models",
  m02: "M02_ministerial_model_questions",
} as const;

export type MinisterialTemplateKey =
  (typeof MINISTERIAL_TEMPLATE_KEYS)[keyof typeof MINISTERIAL_TEMPLATE_KEYS];

export const M01_COLUMNS = [
  "subject_code",
  "track_code",
  "academic_year",
  "exam_round_code",
  "model_variant_code",
  "model_label",
] as const;

export const M01_REQUIRED_COLUMNS = [
  "subject_code",
  "track_code",
  "academic_year",
  "exam_round_code",
  "model_variant_code",
] as const;

/**
 * MVP operator surface: the ministry models are Grade 12 only and no longer
 * ask content staff to choose a round or type a variant. The protected RPC
 * contract still receives both fields so existing DB guarantees stay intact.
 */
export const DEFAULT_MINISTERIAL_ROUND_CODE = "r1" as const;
export const DEFAULT_MINISTERIAL_VARIANT_CODE = "main" as const;

export const M01_OPERATOR_COLUMNS = [
  "subject_code",
  "track_code",
  "academic_year",
  "model_label",
] as const;

export const M01_OPERATOR_REQUIRED_COLUMNS = [
  "subject_code",
  "track_code",
  "academic_year",
] as const;

export function normalizeM01OperatorRow(row: Record<string, string>): Record<string, string> {
  const subjectCode = (row.subject_code ?? "").trim().toLowerCase();
  if (!/^sub-g12-\d{3}$/.test(subjectCode)) {
    throw new MinisterialContractError(
      "MINISTERIAL_GRADE_SCOPE_INVALID",
      "النماذج الوزارية السابقة متاحة للصف الثالث الثانوي فقط.",
    );
  }
  return {
    ...row,
    subject_code: subjectCode,
    exam_round_code: DEFAULT_MINISTERIAL_ROUND_CODE,
    model_variant_code: DEFAULT_MINISTERIAL_VARIANT_CODE,
  };
}

export const M02_COLUMNS = [
  "ministerial_model_code",
  "question_code",
  "original_question_number",
  "section_code",
  "marks",
  "source_page",
  "source_reference",
  "display_order",
] as const;

export const M02_REQUIRED_COLUMNS = [
  "ministerial_model_code",
  "question_code",
  "original_question_number",
  "marks",
  "display_order",
] as const;

/**
 * M02 binds PUBLISHED question-bank revisions to a model. It must never carry
 * question content or answers — those live only in the question bank.
 */
export const M02_FORBIDDEN_COLUMNS = [
  "question_text",
  "stimulus_text",
  "options",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer",
  "correct_index",
  "explanation",
  "solution",
  "solution_steps",
  "accepted_answers",
] as const;

export const MINISTERIAL_ROUND_CODES = ["r1", "r2", "r3", "makeup"] as const;
export const MINISTERIAL_TRACK_CODES = ["sanaa", "aden", "other"] as const;

export const TCS2_SUBJECT_CODE_RE = /^sub-[a-z0-9]+-\d{3}$/;
export const TCS2_QUESTION_CODE_RE = /^q-[a-z0-9]+-\d{3}-\d{5}$/;
export const MINISTERIAL_VARIANT_RE = /^[a-z0-9-]{1,20}$/;

export type MinisterialCodeInput = {
  subjectCode: string;
  trackCode: string;
  academicYear: number;
  roundCode: string;
  variantCode: string;
};

export class MinisterialContractError extends Error {
  constructor(
    public readonly code: string,
    messageAr: string,
  ) {
    super(messageAr);
    this.name = "MinisterialContractError";
  }
}

/**
 * TCS-2 ministerial extension:
 *   mex-{gradeShort}-{trackCode}-{subjectNo:003}-{year:4}-{roundCode}-{variantCode}
 * Mirrors public.ministerial_build_model_code() exactly.
 */
export function buildMinisterialModelCode(input: MinisterialCodeInput): string {
  const subjectCode = input.subjectCode.trim().toLowerCase();
  if (!TCS2_SUBJECT_CODE_RE.test(subjectCode)) {
    throw new MinisterialContractError(
      "TCS1_CODE_REJECTED",
      `كود المادة «${input.subjectCode}» ليس كوداً صالحاً وفق TCS-2.`,
    );
  }
  const trackCode = input.trackCode.trim().toLowerCase();
  if (!(MINISTERIAL_TRACK_CODES as readonly string[]).includes(trackCode)) {
    throw new MinisterialContractError(
      "MINISTERIAL_INVALID_TRACK_CODE",
      `مسار غير صالح: ${trackCode}`,
    );
  }
  const roundCode = input.roundCode.trim().toLowerCase();
  if (!(MINISTERIAL_ROUND_CODES as readonly string[]).includes(roundCode)) {
    throw new MinisterialContractError(
      "MINISTERIAL_INVALID_ROUND_CODE",
      `دور غير صالح: ${roundCode}`,
    );
  }
  const variantCode = input.variantCode.trim().toLowerCase();
  if (!MINISTERIAL_VARIANT_RE.test(variantCode)) {
    throw new MinisterialContractError(
      "MINISTERIAL_INVALID_VARIANT_CODE",
      `رمز النموذج غير صالح: ${variantCode}`,
    );
  }
  const year = input.academicYear;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new MinisterialContractError("MINISTERIAL_INVALID_YEAR", `سنة غير صالحة: ${year}`);
  }

  const [, gradeShort, subjectNo] = subjectCode.split("-");
  return `mex-${gradeShort}-${trackCode}-${subjectNo}-${year}-${roundCode}-${variantCode}`;
}

export function assertNoForbiddenM02Columns(headers: readonly string[]): void {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const hit = M02_FORBIDDEN_COLUMNS.find((c) => normalized.includes(c));
  if (hit) {
    throw new MinisterialContractError(
      "M02_FORBIDDEN_COLUMN",
      `العمود «${hit}» ممنوع في قالب M02: الأسئلة والإجابات تُدار حصراً في بنك الأسئلة.`,
    );
  }
}

export function assertRequiredColumns(
  headers: readonly string[],
  required: readonly string[],
  templateKey: MinisterialTemplateKey,
): void {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const missing = required.filter((c) => !normalized.includes(c));
  if (missing.length > 0) {
    throw new MinisterialContractError(
      "MINISTERIAL_MISSING_COLUMN",
      `أعمدة ناقصة في ${templateKey}: ${missing.join("، ")}`,
    );
  }
}

export type PreviewAction = "INSERT" | "UPDATE" | "SKIP" | "BLOCKED";

export const PREVIEW_ACTION_LABEL_AR: Record<PreviewAction, string> = {
  INSERT: "إضافة",
  UPDATE: "تحديث",
  SKIP: "تخطي (مطابق)",
  BLOCKED: "محجوب",
};

export const MINISTERIAL_BLOCK_REASON_AR: Record<string, string> = {
  SUBJECT_NOT_FOUND: "المادة غير موجودة",
  TRACK_NOT_FOUND: "المسار غير موجود",
  TRACK_INACTIVE: "المسار غير نشط",
  SUBJECT_TRACK_NOT_ASSIGNED: "المادة غير مرتبطة بهذا المسار",
  TCS1_CODE_REJECTED: "كود بمخطط TCS-1 مرفوض",
  MODEL_IDENTITY_IMMUTABLE: "لا يمكن تعديل هوية نموذج منشور",
  DUPLICATE_ROW_IN_FILE: "صف مكرر داخل الملف",
  MODEL_NOT_FOUND: "النموذج غير موجود",
  MODEL_NOT_DRAFT: "النموذج ليس مسودة",
  QUESTION_NOT_FOUND: "السؤال غير موجود",
  QUESTION_NOT_PUBLISHED: "السؤال غير منشور في بنك الأسئلة",
  QUESTION_SUBJECT_MISMATCH: "السؤال يخص مادة أخرى",
  TARGET_SUBJECT_MISMATCH: "هدف السؤال لا يطابق مادة النموذج",
  DUPLICATE_DISPLAY_ORDER: "ترتيب عرض مكرر",
  MINISTERIAL_REVISION_CHANGED_REPREPARE: "تغيّرت النسخة المنشورة بعد التجهيز — أعد التجهيز",
};

export function describeBlockReason(reason: string | null | undefined): string {
  if (!reason) return "";
  return MINISTERIAL_BLOCK_REASON_AR[reason] ?? reason;
}
