/** Contract: official_normalized_v1 (TARGET). No Excel correct_index column. */

export const OFFICIAL_NORMALIZED_V1 = "official_normalized_v1" as const;

export const QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMERIC",
  "MANUAL",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const GRADING_MODES = ["AUTO_SINGLE", "AUTO_TEXT", "MANUAL"] as const;
export type GradingMode = (typeof GRADING_MODES)[number];

export const NORMALIZATION_POLICIES = ["EXACT", "TRIM", "TRIM_COLLAPSE"] as const;
export type NormalizationPolicy = (typeof NORMALIZATION_POLICIES)[number];

export type OfficialNormalizedOption = {
  option_code: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
};

export type OfficialNormalizedV1 = {
  schema_version: typeof OFFICIAL_NORMALIZED_V1;
  question_code: string;
  revision_code: string | null;
  grade_code: string | null;
  semester_code: string | null;
  subject_code: string;
  unit_code: string | null;
  lesson_code: string | null;
  question_type: QuestionType;
  grading_mode: GradingMode;
  question_text: string;
  stimulus_text: string | null;
  max_score: number;
  allow_partial: boolean;
  requires_media: boolean;
  difficulty: string | null;
  source: string | null;
  tags: string[];
  options: OfficialNormalizedOption[];
  correct_answer_text: string | null;
  normalization_policy: NormalizationPolicy | null;
  model_answer: string | null;
  rubric: string | null;
  media_reference: string | null;
  /** Derived legacy cache only — never an Excel source column. */
  legacy_correct_index_0_based: number | null;
};

export type CatalogLookup = {
  subjects: Set<string>;
  lessons: Set<string>;
};

export function emptyNormalized(partial: Partial<OfficialNormalizedV1> & Pick<OfficialNormalizedV1, "question_code" | "subject_code" | "question_text" | "question_type" | "grading_mode">): OfficialNormalizedV1 {
  return {
    schema_version: OFFICIAL_NORMALIZED_V1,
    revision_code: null,
    grade_code: null,
    semester_code: null,
    unit_code: null,
    lesson_code: null,
    stimulus_text: null,
    max_score: 1,
    allow_partial: false,
    requires_media: false,
    difficulty: null,
    source: null,
    tags: [],
    options: [],
    correct_answer_text: null,
    normalization_policy: null,
    model_answer: null,
    rubric: null,
    media_reference: null,
    legacy_correct_index_0_based: null,
    ...partial,
    schema_version: OFFICIAL_NORMALIZED_V1,
  };
}
