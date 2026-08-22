/**
 * TAMKEEN_LESSON_CONTENT_ARCHITECTURE_V3_FULL_SOURCE_CLOSURE_21C_21G
 *
 * The FINAL Content V3 capability contract. Pure logic (no React, no DB).
 *
 * V3 defines exactly seven lesson capabilities. They are NOT new storage:
 * each one is a stable, renamed view over the existing 20B contract keys
 * (`lesson-content-contract.ts`), so no data model changes and no legacy rows
 * are lost.
 *
 * Explicitly NOT capabilities:
 *   - originalBookPdf      → subject-level textbook (21B) / legacy reference
 *   - studentPerformance   → derived analytics, never authored content
 *   - supportingResources  → optional extras, never a mandatory journey step
 */

import {
  computeLessonReadinessLevels,
  type LessonCapabilityContract,
  type LessonCapabilityState,
  type LessonContentCapabilityKey,
} from "./lesson-content-contract";

/* ------------------------------------------------------------------ */
/* 1 — capability keys + canonical order                               */
/* ------------------------------------------------------------------ */

export const V3_CAPABILITIES = [
  "officialBookContent",
  "tamkeenExplanationHtml",
  "lessonSummaryHtml",
  "mindMapHtml",
  "labExperimentHtml",
  "officialBookQuestions",
  "selfTest",
] as const;

export type V3CapabilityKey = (typeof V3_CAPABILITIES)[number];

/** Student journey order (21G-B). Identical to `V3_CAPABILITIES`. */
export const V3_STUDENT_ORDER: readonly V3CapabilityKey[] = V3_CAPABILITIES;

/** Content ownership: official ministry material vs. Tamkeen-authored. */
export const V3_CONTENT_OWNER: Record<V3CapabilityKey, "OFFICIAL" | "TAMKEEN"> = {
  officialBookContent: "OFFICIAL",
  officialBookQuestions: "OFFICIAL",
  tamkeenExplanationHtml: "TAMKEEN",
  lessonSummaryHtml: "TAMKEEN",
  mindMapHtml: "TAMKEEN",
  labExperimentHtml: "TAMKEEN",
  selfTest: "TAMKEEN",
};

export const V3_LABEL_AR: Record<V3CapabilityKey, string> = {
  officialBookContent: "محتوى الكتاب الرسمي",
  tamkeenExplanationHtml: "شرح تمكين",
  lessonSummaryHtml: "ملخص الدرس",
  mindMapHtml: "الخريطة الذهنية",
  labExperimentHtml: "التجارب / النشاط التفاعلي",
  officialBookQuestions: "أسئلة الدرس",
  selfTest: "اختبر فهمك",
};

export const V3_ICON: Record<V3CapabilityKey, string> = {
  officialBookContent: "📖",
  tamkeenExplanationHtml: "👨‍🏫",
  lessonSummaryHtml: "🧠",
  mindMapHtml: "🗺️",
  labExperimentHtml: "🧪",
  officialBookQuestions: "📝",
  selfTest: "✅",
};

/** V3 key → backing 20B contract key (no data migration required). */
export const V3_TO_LEGACY_KEY: Record<V3CapabilityKey, LessonContentCapabilityKey> = {
  officialBookContent: "officialBookContent",
  tamkeenExplanationHtml: "tamkeenExplanation",
  lessonSummaryHtml: "quickReview",
  mindMapHtml: "mindMap",
  labExperimentHtml: "simulation",
  officialBookQuestions: "checkUnderstanding",
  selfTest: "lessonAssessment",
};

export const LEGACY_KEY_TO_V3: Partial<Record<LessonContentCapabilityKey, V3CapabilityKey>> =
  Object.fromEntries(
    (Object.entries(V3_TO_LEGACY_KEY) as [V3CapabilityKey, LessonContentCapabilityKey][]).map(
      ([v3, legacy]) => [legacy, v3],
    ),
  );

/** Keys that survive as admin/legacy reference only — never a student step. */
export const V3_NON_CAPABILITIES: readonly LessonContentCapabilityKey[] = [
  "originalBookPdf",
  "studentPerformance",
  "supportingResources",
];

/* ------------------------------------------------------------------ */
/* 2 — applicability (21F)                                             */
/* ------------------------------------------------------------------ */

export type CapabilityApplicability = "REQUIRED" | "OPTIONAL" | "NA";

/**
 * Default applicability when the lesson carries no explicit override.
 * The lab experiment is never required for every lesson.
 */
export const DEFAULT_APPLICABILITY: Record<V3CapabilityKey, CapabilityApplicability> = {
  officialBookContent: "REQUIRED",
  tamkeenExplanationHtml: "REQUIRED",
  lessonSummaryHtml: "REQUIRED",
  mindMapHtml: "REQUIRED",
  labExperimentHtml: "OPTIONAL",
  officialBookQuestions: "REQUIRED",
  selfTest: "REQUIRED",
};

export type ApplicabilityMap = Partial<Record<V3CapabilityKey, CapabilityApplicability>>;

export function resolveApplicability(
  overrides: ApplicabilityMap | undefined,
  key: V3CapabilityKey,
): CapabilityApplicability {
  return overrides?.[key] ?? DEFAULT_APPLICABILITY[key];
}

/* ------------------------------------------------------------------ */
/* 3 — V3 capability view                                              */
/* ------------------------------------------------------------------ */

export interface V3CapabilityState {
  key: V3CapabilityKey;
  legacyKey: LessonContentCapabilityKey;
  label: string;
  icon: string;
  owner: "OFFICIAL" | "TAMKEEN";
  applicability: CapabilityApplicability;
  /** Underlying 20B state (presence, lifecycle status, source, timestamps). */
  state: LessonCapabilityState;
  /** READY + student-visible + not N/A. */
  ready: boolean;
  /** The student journey renders this step. */
  studentVisible: boolean;
}

export function buildV3CapabilityView(
  contract: LessonCapabilityContract,
  applicability?: ApplicabilityMap,
): V3CapabilityState[] {
  return V3_STUDENT_ORDER.map((key) => {
    const legacyKey = V3_TO_LEGACY_KEY[key];
    const state = contract[legacyKey];
    const app = resolveApplicability(applicability, key);
    const ready =
      app !== "NA" && state.present && state.status === "READY" && state.studentVisible;
    return {
      key,
      legacyKey,
      label: V3_LABEL_AR[key],
      icon: V3_ICON[key],
      owner: V3_CONTENT_OWNER[key],
      applicability: app,
      state,
      ready,
      // Fail-closed: N/A hidden, not-ready hidden. No "غير متوفر" placeholders.
      studentVisible: ready,
    };
  });
}

/** Ordered steps the student actually sees. Empty when nothing is ready. */
export function studentV3Journey(
  contract: LessonCapabilityContract,
  applicability?: ApplicabilityMap,
): V3CapabilityState[] {
  return buildV3CapabilityView(contract, applicability).filter((c) => c.studentVisible);
}

/** Dynamic progress denominator — only capabilities that really exist. */
export function v3ProgressTotal(
  contract: LessonCapabilityContract,
  applicability?: ApplicabilityMap,
): number {
  return studentV3Journey(contract, applicability).length;
}

/* ------------------------------------------------------------------ */
/* 4 — readiness levels (21F)                                          */
/* ------------------------------------------------------------------ */

export interface V3Readiness {
  bookReady: boolean;
  learningReady: boolean;
  assessmentReady: boolean;
  fullyReady: boolean;
  /** Missing REQUIRED capabilities per level (V3 keys, empty when satisfied). */
  missingForLearning: V3CapabilityKey[];
  missingForAssessment: V3CapabilityKey[];
  missing: V3CapabilityKey[];
}

/**
 * BOOK_READY       = officialBookContent READY
 * LEARNING_READY   = BOOK_READY + every REQUIRED learning capability READY
 *                    (lab experiment counts ONLY when marked REQUIRED)
 * ASSESSMENT_READY = officialBookQuestions READY (answer layer complete)
 *                    + selfTest READY, for those marked REQUIRED
 * FULLY_READY      = LEARNING_READY + ASSESSMENT_READY
 *
 * Fail-closed: anything not provably READY blocks the level.
 */
export function computeV3Readiness(
  contract: LessonCapabilityContract,
  applicability?: ApplicabilityMap,
): V3Readiness {
  const view = buildV3CapabilityView(contract, applicability);
  const byKey = new Map(view.map((c) => [c.key, c]));
  const isReady = (k: V3CapabilityKey) => byKey.get(k)?.ready === true;
  const isRequired = (k: V3CapabilityKey) => resolveApplicability(applicability, k) === "REQUIRED";
  const unmet = (keys: V3CapabilityKey[]) => keys.filter((k) => isRequired(k) && !isReady(k));

  const bookReady = isReady("officialBookContent");
  const missingForLearning = unmet([
    "officialBookContent",
    "tamkeenExplanationHtml",
    "lessonSummaryHtml",
    "mindMapHtml",
    "labExperimentHtml",
  ]);
  const missingForAssessment = unmet(["officialBookQuestions", "selfTest"]);

  const learningReady = bookReady && missingForLearning.length === 0;
  const assessmentReady = missingForAssessment.length === 0;

  return {
    bookReady,
    learningReady,
    assessmentReady,
    fullyReady: learningReady && assessmentReady,
    missingForLearning,
    missingForAssessment,
    missing: [...new Set([...missingForLearning, ...missingForAssessment])],
  };
}

/** Human-readable Arabic explanation of what blocks a readiness level. */
export function explainMissing(keys: readonly V3CapabilityKey[]): string {
  if (keys.length === 0) return "لا يوجد نقص";
  return keys.map((k) => V3_LABEL_AR[k]).join("، ");
}

/**
 * 21F bridge — legacy readiness stays available for older surfaces, but V3 is
 * authoritative. Exposed so callers can diff the two during rollout.
 */
export function legacyReadiness(contract: LessonCapabilityContract) {
  return computeLessonReadinessLevels(contract);
}
