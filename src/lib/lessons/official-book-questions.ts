/**
 * PHASE 21D — OFFICIAL BOOK QUESTIONS  +  PHASE 21E — SELF TEST
 *
 * The official lesson questions printed in the ministry textbook, and the
 * Tamkeen self-test built on top of the existing question bank.
 *
 * HARD SECURITY CONTRACT
 *   MODEL_ANSWER_NOT_IN_INITIAL_CLIENT_PAYLOAD = REQUIRED
 *   The question text is official content and ships normally. The model
 *   answer, the correct-option flag and every option rationale live in a
 *   companion answer layer that is ONLY resolvable after the student submits
 *   an attempt ("تأكد من إجابتك"). Nothing here ever embeds an answer into
 *   HTML, data attributes, serialized props, preloaded API payloads or cache.
 */

export const OFFICIAL_QUESTION_TYPES = [
  "short_text",
  "essay",
  "single_choice",
  "true_false",
  "fill_blank",
  "matching",
  "ordering",
  "multipart",
] as const;

export type OfficialQuestionType = (typeof OFFICIAL_QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL_AR: Record<OfficialQuestionType, string> = {
  short_text: "إجابة قصيرة",
  essay: "إجابة مقالية",
  single_choice: "اختيار من متعدد",
  true_false: "صح / خطأ",
  fill_blank: "إكمال الفراغ",
  matching: "توصيل",
  ordering: "ترتيب",
  multipart: "سؤال متعدد الأجزاء",
};

/** Types we can grade deterministically on the server. */
export const AUTO_GRADABLE_TYPES: readonly OfficialQuestionType[] = [
  "single_choice",
  "true_false",
  "matching",
  "ordering",
];

/** Essay/long answers have no trusted grading policy — comparison only. */
export function isAutoGradable(type: OfficialQuestionType): boolean {
  return AUTO_GRADABLE_TYPES.includes(type);
}

/* ------------------------------------------------------------------ */
/* Client-safe shapes                                                  */
/* ------------------------------------------------------------------ */

/** An option as the client may receive it BEFORE reveal. */
export interface PublicQuestionOption {
  id: string;
  text: string;
  /** Presentation order only. Never carries correctness. */
  sortOrder: number;
}

/** A question as the client may receive it BEFORE reveal. */
export interface PublicQuestion {
  id: string;
  type: OfficialQuestionType;
  text: string;
  sortOrder: number;
  options: PublicQuestionOption[];
  /** Pinned content revision the attempt is graded against (21E). */
  revisionId: string | null;
  /** Sub-questions for multipart, each already sanitized. */
  parts?: PublicQuestion[];
}

/* ------------------------------------------------------------------ */
/* Secret answer layer (server-side only)                              */
/* ------------------------------------------------------------------ */

export interface OptionRationale {
  optionId: string;
  /** Exactly one of the two is authored per option. */
  whyCorrect?: string | null;
  whyWrong?: string | null;
}

export interface AnswerLayerEntry {
  questionId: string;
  correctOptionIds: string[];
  modelAnswer: string | null;
  /** Teaching explanation shown after reveal. */
  explanation: string | null;
  rationales: OptionRationale[];
}

/** Keys that must NEVER appear in a client payload before reveal. */
export const FORBIDDEN_CLIENT_KEYS: readonly string[] = [
  "correct",
  "is_correct",
  "isCorrect",
  "correct_option",
  "correctOptionIds",
  "answer",
  "model_answer",
  "modelAnswer",
  "explanation",
  "rationale",
  "rationales",
  "why_correct",
  "whyCorrect",
  "why_wrong",
  "whyWrong",
];

/** Strips every answer-bearing field. The only client serializer allowed. */
export function toPublicQuestion(raw: Record<string, unknown>): PublicQuestion {
  const type = (raw["question_type"] ?? raw["type"] ?? "single_choice") as OfficialQuestionType;
  const rawOptions = Array.isArray(raw["options"]) ? (raw["options"] as unknown[]) : [];
  const options: PublicQuestionOption[] = rawOptions.map((o, i) => {
    const obj = (typeof o === "object" && o !== null ? o : {}) as Record<string, unknown>;
    return {
      id: String(obj["id"] ?? obj["option_id"] ?? i),
      text: String(obj["text"] ?? obj["option_text"] ?? o ?? ""),
      sortOrder: Number(obj["sort_order"] ?? i),
    };
  });
  const rawParts = Array.isArray(raw["parts"]) ? (raw["parts"] as Record<string, unknown>[]) : null;
  const question: PublicQuestion = {
    id: String(raw["id"] ?? ""),
    type: OFFICIAL_QUESTION_TYPES.includes(type) ? type : "single_choice",
    text: String(raw["question_text"] ?? raw["text"] ?? ""),
    sortOrder: Number(raw["sort_order"] ?? 0),
    options,
    revisionId: (raw["revision_id"] as string | null) ?? null,
  };
  if (rawParts) question.parts = rawParts.map(toPublicQuestion);
  return question;
}

/** Test helper + runtime guard: does this payload leak an answer? */
export function containsAnswerLeak(payload: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (value: unknown): boolean => {
    if (value === null || typeof value !== "object") return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some(walk);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_CLIENT_KEYS.includes(k)) return true;
      if (walk(v)) return true;
    }
    return false;
  };
  return walk(payload);
}

/* ------------------------------------------------------------------ */
/* Reveal gate                                                         */
/* ------------------------------------------------------------------ */

export type RevealDenyReason =
  | "NO_ATTEMPT_SUBMITTED"
  | "REVISION_MISMATCH"
  | "LESSON_NOT_READY";

export interface RevealRequest {
  /** The student actually submitted an answer for this question. */
  attemptSubmitted: boolean;
  /** Answer text/selection the student submitted (may be empty string). */
  submittedAnswer: string | null;
  /** Revision the question was served with. */
  servedRevisionId: string | null;
  /** Revision currently pinned for the attempt. */
  attemptRevisionId: string | null;
  /** The capability is READY for this student. */
  capabilityReady: boolean;
}

export interface RevealDecision {
  allowed: boolean;
  reason: RevealDenyReason | null;
}

/**
 * Fail-closed reveal gate. "تأكد من إجابتك" is the only path to a model answer.
 */
export function evaluateReveal(request: RevealRequest): RevealDecision {
  if (!request.capabilityReady) return { allowed: false, reason: "LESSON_NOT_READY" };
  if (!request.attemptSubmitted || request.submittedAnswer === null) {
    return { allowed: false, reason: "NO_ATTEMPT_SUBMITTED" };
  }
  if (request.servedRevisionId !== request.attemptRevisionId) {
    return { allowed: false, reason: "REVISION_MISMATCH" };
  }
  return { allowed: true, reason: null };
}

export interface RevealPayload {
  questionId: string;
  type: OfficialQuestionType;
  /** Present only for auto-gradable types. */
  isCorrect: boolean | null;
  correctOptionIds: string[];
  modelAnswer: string | null;
  explanation: string | null;
  rationales: OptionRationale[];
  /** Essay/short text: compare-only, no score is written. */
  comparisonOnly: boolean;
}

export function buildRevealPayload(
  entry: AnswerLayerEntry,
  type: OfficialQuestionType,
  submittedOptionIds: readonly string[] = [],
): RevealPayload {
  const gradable = isAutoGradable(type);
  const isCorrect = gradable
    ? entry.correctOptionIds.length > 0 &&
      entry.correctOptionIds.length === submittedOptionIds.length &&
      entry.correctOptionIds.every((id) => submittedOptionIds.includes(id))
    : null;
  return {
    questionId: entry.questionId,
    type,
    isCorrect,
    correctOptionIds: gradable ? entry.correctOptionIds : [],
    modelAnswer: entry.modelAnswer,
    explanation: entry.explanation,
    rationales: entry.rationales,
    comparisonOnly: !gradable,
  };
}
