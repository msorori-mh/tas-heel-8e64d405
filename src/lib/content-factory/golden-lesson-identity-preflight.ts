import type { GoldenLessonIdentity } from "./golden-lesson-contract.ts";

export const GOLDEN_IDENTITY_FIELD_LABELS = {
  gradeCode: "الصف",
  curriculumTrackCodes: "المسارات",
  subjectCode: "المادة",
  lessonCode: "كود الدرس",
  lessonSlug: "معرّف الدرس",
  unitCode: "الوحدة",
  semester: "الفصل الدراسي",
  sortOrder: "ترتيب الدرس",
} as const satisfies Record<keyof GoldenLessonIdentity, string>;

export type GoldenIdentityField = keyof typeof GOLDEN_IDENTITY_FIELD_LABELS;

export interface GoldenIdentityDifference {
  field: GoldenIdentityField;
  labelAr: string;
  currentValue: string | number | string[] | null;
  incomingValue: string | number | string[] | null;
}

const STABLE_FIELDS = [
  "gradeCode",
  "subjectCode",
  "lessonCode",
  "lessonSlug",
] as const satisfies readonly GoldenIdentityField[];

function normalizeCode(value: unknown, casing: "upper" | "lower") {
  const normalized = String(value ?? "").trim();
  return casing === "upper" ? normalized.toUpperCase() : normalized.toLowerCase();
}

function normalizeNullableCode(value: unknown) {
  const normalized = normalizeCode(value, "lower");
  return normalized || null;
}

function normalizePositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/** Canonical form used for comparisons only; the source manifest remains versioned verbatim. */
export function canonicalGoldenLessonIdentity(
  identity: GoldenLessonIdentity,
): GoldenLessonIdentity {
  const tracks = Array.from(
    new Set(
      (Array.isArray(identity.curriculumTrackCodes) ? identity.curriculumTrackCodes : [])
        .map((code) => normalizeCode(code, "lower"))
        .filter(Boolean),
    ),
  ).sort();

  return {
    gradeCode: normalizeCode(identity.gradeCode, "upper"),
    curriculumTrackCodes: tracks,
    subjectCode: normalizeCode(identity.subjectCode, "upper"),
    lessonCode: normalizeCode(identity.lessonCode, "upper"),
    lessonSlug: normalizeCode(identity.lessonSlug, "lower"),
    unitCode: normalizeNullableCode(identity.unitCode),
    semester: normalizePositiveInteger(identity.semester),
    sortOrder: normalizePositiveInteger(identity.sortOrder),
  };
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function diffGoldenLessonIdentity(
  current: GoldenLessonIdentity,
  incoming: GoldenLessonIdentity,
): GoldenIdentityDifference[] {
  const left = canonicalGoldenLessonIdentity(current);
  const right = canonicalGoldenLessonIdentity(incoming);
  return (Object.keys(GOLDEN_IDENTITY_FIELD_LABELS) as GoldenIdentityField[])
    .filter((field) => !valuesEqual(left[field], right[field]))
    .map((field) => ({
      field,
      labelAr: GOLDEN_IDENTITY_FIELD_LABELS[field],
      currentValue: left[field],
      incomingValue: right[field],
    }));
}

export function stableGoldenLessonIdentityMatches(
  current: GoldenLessonIdentity,
  incoming: GoldenLessonIdentity,
) {
  const differences = diffGoldenLessonIdentity(current, incoming);
  return differences.every(
    (difference) => !STABLE_FIELDS.includes(difference.field as (typeof STABLE_FIELDS)[number]),
  );
}

export function canRebindGoldenLessonDraft(input: {
  current: GoldenLessonIdentity;
  incoming: GoldenLessonIdentity;
  profileMatches: boolean;
  reviewStatus: string;
  reviewCount: number;
  domainBatchCount: number;
}) {
  return (
    input.profileMatches &&
    input.reviewStatus === "DRAFT" &&
    input.reviewCount === 0 &&
    input.domainBatchCount === 0 &&
    stableGoldenLessonIdentityMatches(input.current, input.incoming)
  );
}

function displayValue(value: GoldenIdentityDifference["currentValue"]) {
  if (Array.isArray(value)) return value.length ? value.join("، ") : "بلا مسارات";
  if (value === null || value === "") return "غير محدد";
  return String(value);
}

export function describeGoldenIdentityConflictAr(differences: GoldenIdentityDifference[]) {
  if (differences.length === 0) return "لا يوجد اختلاف في هوية الحزمة.";
  return differences
    .map(
      (difference) =>
        `${difference.labelAr}: ${displayValue(difference.currentValue)} ← ${displayValue(difference.incomingValue)}`,
    )
    .join("؛ ");
}
