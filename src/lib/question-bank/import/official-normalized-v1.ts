/** Normative QB-02 dry-run document; it intentionally has no writer fields. */
export const OFFICIAL_NORMALIZED_V1 = "official_normalized_v1" as const;
export const INTERACTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "SHORT_TEXT",
  "LONG_TEXT",
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];
export const GRADING_MODES = ["AUTO_SINGLE", "AUTO_TEXT", "MANUAL"] as const;
export type GradingMode = (typeof GRADING_MODES)[number];

export type OfficialNormalizedOption = {
  option_code: string;
  body: string;
  sort_order: number;
  is_correct: boolean;
};
export type AcceptedAnswer = { answer_text: string; normalized_answer: string; sort_order: number };
export type ImportTarget = {
  target_type: "SUBJECT" | "LESSON";
  target_code: string;
  is_primary: boolean;
};
export type QuestionAnswerLayer = {
  model_answer: string | null;
  explanation: string | null;
  option_rationales: Array<{
    option_code: string;
    why_correct: string | null;
    why_wrong: string | null;
  }>;
};
export type OfficialNormalizedV1 = {
  contract: typeof OFFICIAL_NORMALIZED_V1;
  question_code: string;
  revision: {
    status: "DRAFT";
    interaction_type: InteractionType;
    grading_mode: GradingMode;
    /** Semantic student section; never inferred from interaction shape. */
    educational_label?: import("./question-content-role.ts").QuestionContentRole | null;
    question_text: string;
    stimulus_text: string | null;
    max_score: number;
    allow_partial: boolean;
  };
  options: OfficialNormalizedOption[];
  accepted_answers: AcceptedAnswer[];
  solutions: Array<{ body: string }>;
  solution_steps: Array<{ body: string; sort_order: number }>;
  /** Revision-pinned post-attempt payload; never part of the initial student response. */
  answer_layer?: QuestionAnswerLayer | null;
  media: Array<{ url: string; media_type: string; alt_text: string | null }>;
  targets: ImportTarget[];
  provenance: {
    source_contract: string;
    source_row: number | null;
    metadata?: Record<string, string>;
  };
};

export function emptyNormalized(
  partial: Partial<OfficialNormalizedV1> &
    Pick<OfficialNormalizedV1, "question_code" | "revision" | "provenance">,
): OfficialNormalizedV1 {
  return {
    options: [],
    accepted_answers: [],
    solutions: [],
    solution_steps: [],
    answer_layer: null,
    media: [],
    targets: [],
    ...partial,
    contract: OFFICIAL_NORMALIZED_V1,
  };
}
