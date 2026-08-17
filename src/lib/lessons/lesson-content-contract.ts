/**
 * TAMKEEN_LESSON_CONTENT_WORKSPACE_AND_CAPABILITY_CONTRACT_20B
 *
 * Canonical, UI-free contract describing every content layer of a lesson.
 * It is derived ONLY from tables that already exist (no new system, no new
 * table): lesson_book_contents, lesson_explanations, lesson_resources,
 * lesson_simulations, lesson_summaries, questions / lesson_assessments,
 * exam_templates, user_progress.
 *
 * Business rules live here — never inside a component.
 *   - A capability that is not backed by real content does NOT exist.
 *   - Nothing is implied by subject type.
 *   - Student order is fixed and defined once (STUDENT_CAPABILITY_ORDER).
 */

import { isPlaceholderBookContent, isValidResourceUrl } from "./lesson-capabilities";
import type { CapabilityResourceInput } from "./lesson-capabilities";

export const LESSON_CONTENT_CAPABILITIES = [
  "officialBookContent",
  "tamkeenExplanation",
  "mindMap",
  "simulation",
  "supportingResources",
  "quickReview",
  "checkUnderstanding",
  "lessonAssessment",
  "studentPerformance",
  "originalBookPdf",
] as const;

export type LessonContentCapabilityKey = (typeof LESSON_CONTENT_CAPABILITIES)[number];

/** Official student rendering order (20B §3). */
export const STUDENT_CAPABILITY_ORDER: readonly LessonContentCapabilityKey[] = [
  "officialBookContent",
  "tamkeenExplanation",
  "mindMap",
  "simulation",
  "supportingResources",
  "quickReview",
  "checkUnderstanding",
  "lessonAssessment",
  "studentPerformance",
  "originalBookPdf",
];

export const CAPABILITY_LABEL_AR: Record<LessonContentCapabilityKey, string> = {
  officialBookContent: "محتوى الكتاب الرسمي",
  tamkeenExplanation: "شرح تمكين",
  mindMap: "الخريطة الذهنية",
  simulation: "المحاكاة / النشاط التفاعلي",
  supportingResources: "الموارد المساعدة",
  quickReview: "المراجعة السريعة",
  checkUnderstanding: "اختبر فهمك",
  lessonAssessment: "اختبار الدرس",
  studentPerformance: "مستواك وأخطاؤك",
  originalBookPdf: "نسخة الكتاب الأصلية (PDF)",
};

export const CAPABILITY_ICON_AR: Record<LessonContentCapabilityKey, string> = {
  officialBookContent: "📖",
  tamkeenExplanation: "👨‍🏫",
  mindMap: "🗺️",
  simulation: "🧪",
  supportingResources: "🎥",
  quickReview: "🧠",
  checkUnderstanding: "✅",
  lessonAssessment: "🏆",
  studentPerformance: "📈",
  originalBookPdf: "📚",
};

/**
 * Status model. `READY` is the only state a student may ever render.
 * `DRAFT` exists today only for entities covered by content_review_state;
 * for the rest it is derived (present-but-invalid ⇒ DRAFT, see 20B §9 gap).
 */
export type CapabilityStatus = "ABSENT" | "DRAFT" | "READY" | "INVALID";

export interface LessonCapabilityState {
  key: LessonContentCapabilityKey;
  label: string;
  icon: string;
  /** Real backing content exists (rows > 0 and usable). */
  present: boolean;
  status: CapabilityStatus;
  /** The student may render it right now. */
  studentVisible: boolean;
  /** Table (+ discriminator) the state was derived from. */
  sourceRef: string;
  /** How many concrete rows back it. */
  count: number;
  updatedAt: string | null;
  /**
   * 20B — pointer to the backing HTML artifact (resource_code) when the
   * capability is served by the existing HTML pipeline. Mind map only today.
   */
  htmlRef?: string | null;
  /** Operator-only note; never shown to the student. */
  note?: string;
}

export type LessonCapabilityContract = Record<
  LessonContentCapabilityKey,
  LessonCapabilityState
>;

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

export interface LessonContentContractInput {
  lessonTitle?: string | null;
  deliveryMode?: string | null;
  /** lesson_book_contents rows for this lesson. */
  bookContents: readonly {
    content: string | null;
    pdf_url?: string | null;
    updated_at?: string | null;
  }[];
  /** Legacy inline text (lessons.content_text). */
  inlineContent?: string | null;
  explanations: readonly { updated_at?: string | null }[];
  resources: readonly (CapabilityResourceInput & {
    html_resource_type?: string | null;
    created_at?: string | null;
    /** HTML pipeline lifecycle: draft | in_review | approved | published. */
    lifecycle_status?: string | null;
    resource_code?: string | null;
  })[];
  simulations: readonly { created_at?: string | null }[];
  summaries: readonly {
    summary: string | null;
    updated_at?: string | null;
  }[];
  /** questions bound to this lesson (student-visible bank). */
  questionsCount: number;
  /** lesson_assessments rows. */
  assessmentsCount: number;
  /** exam_templates scoped to this lesson and active. */
  lessonExamCount: number;
  /** Whether student progress/mistakes tracking can produce a signal. */
  performanceTrackable?: boolean;
  /** Enhancement access gate (subscription / free unit / admin). */
  enhancementsAccessible?: boolean;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const has = (v: string | null | undefined) => (v ?? "").trim().length > 0;

function latest(...values: (string | null | undefined)[]): string | null {
  const stamps = values.filter((v): v is string => !!v);
  if (stamps.length === 0) return null;
  return stamps.sort().at(-1) ?? null;
}

function validOfType(
  resources: LessonContentContractInput["resources"],
  type: string,
): LessonContentContractInput["resources"] {
  return resources.filter((r) => r.resource_type === type && isValidResourceUrl(r.url));
}

function state(
  key: LessonContentCapabilityKey,
  partial: Omit<LessonCapabilityState, "key" | "label" | "icon">,
): LessonCapabilityState {
  return {
    key,
    label: CAPABILITY_LABEL_AR[key],
    icon: CAPABILITY_ICON_AR[key],
    ...partial,
  };
}

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

export function buildLessonCapabilityContract(
  input: LessonContentContractInput,
): LessonCapabilityContract {
  const gateOpen = input.enhancementsAccessible !== false;

  /* 1 — official book content */
  const bookRow = input.bookContents.find((r) => has(r.content)) ?? null;
  const bookRaw = has(bookRow?.content) ? bookRow!.content : input.inlineContent;
  const placeholder = has(bookRaw) && isPlaceholderBookContent(bookRaw, input.lessonTitle);
  const bookPresent = has(bookRaw) && !placeholder;
  const officialBookContent = state("officialBookContent", {
    present: bookPresent,
    status: bookPresent ? "READY" : placeholder ? "INVALID" : "ABSENT",
    studentVisible: bookPresent,
    sourceRef: "lesson_book_contents.content",
    count: bookPresent ? 1 : 0,
    updatedAt: latest(...input.bookContents.map((r) => r.updated_at)),
    ...(placeholder ? { note: "محتوى الكتاب مجرد عنوان/بيانات وصفية (خلل بيانات القالب 04)" } : {}),
  });

  /* 2 — Tamkeen explanation */
  const explCount = input.explanations.length;
  const tamkeenExplanation = state("tamkeenExplanation", {
    present: explCount > 0,
    status: explCount > 0 ? "READY" : "ABSENT",
    studentVisible: explCount > 0,
    sourceRef: "lesson_explanations",
    count: explCount,
    updatedAt: latest(...input.explanations.map((r) => r.updated_at)),
  });

  /* 3 — mind map — MIND_MAP_SOURCE=HTML (existing html pipeline, no new model) */
  const mindMapRows = [
    ...validOfType(input.resources, "mindmap"),
    ...input.resources.filter(
      (r) => r.html_resource_type === "mindmap" && isValidResourceUrl(r.url),
    ),
  ].filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
  const mindMapCount = mindMapRows.length;
  const mindMapPublished = mindMapRows.filter(
    (r) => !r.lifecycle_status || r.lifecycle_status === "published",
  );
  const mindMapRef = mindMapRows[0] ?? null;
  const mindMap = state("mindMap", {
    present: mindMapCount > 0,
    status:
      mindMapCount === 0 ? "ABSENT" : mindMapPublished.length > 0 ? "READY" : "DRAFT",
    studentVisible: mindMapPublished.length > 0 && gateOpen,
    sourceRef: "lesson_resources(resource_type=mindmap | html_resource_type=mindmap) [HTML]",
    count: mindMapCount,
    updatedAt: latest(...mindMapRows.map((r) => r.created_at)),
    htmlRef: mindMapRef?.resource_code ?? mindMapRef?.id ?? null,
    ...(mindMapCount > 0 && mindMapPublished.length === 0
      ? { note: "خريطة ذهنية HTML بحالة مسودة/مراجعة — غير مرئية للطالب حتى النشر" }
      : {}),
  });

  /* 4 — simulation / interactive activity */
  const experimentRows = [
    ...validOfType(input.resources, "experiment"),
    ...input.resources.filter(
      (r) => r.html_resource_type === "experiment" && isValidResourceUrl(r.url),
    ),
  ];
  const simCount = new Set(experimentRows.map((r) => r.id)).size + input.simulations.length;
  const simulation = state("simulation", {
    present: simCount > 0,
    status: simCount > 0 ? "READY" : "ABSENT",
    studentVisible: simCount > 0 && gateOpen,
    sourceRef: "lesson_simulations + lesson_resources(experiment)",
    count: simCount,
    updatedAt: latest(
      ...experimentRows.map((r) => r.created_at),
      ...input.simulations.map((r) => r.created_at),
    ),
  });

  /* 5 — supporting resources (video / link / extra pdf, never the primary) */
  const primaryId = input.resources.find((r) => r.is_primary === true)?.id ?? null;
  const isExtra = (r: (typeof input.resources)[number]) =>
    r.is_primary !== true && r.id !== primaryId;
  const supportRows = [
    ...validOfType(input.resources, "video"),
    ...validOfType(input.resources, "link"),
    ...validOfType(input.resources, "pdf").filter(isExtra),
  ].filter(isExtra);
  const supportingResources = state("supportingResources", {
    present: supportRows.length > 0,
    status: supportRows.length > 0 ? "READY" : "ABSENT",
    studentVisible: supportRows.length > 0 && gateOpen,
    sourceRef: "lesson_resources(video|link|pdf, is_primary=false)",
    count: supportRows.length,
    updatedAt: latest(...supportRows.map((r) => r.created_at)),
  });

  /* 6 — quick review (lesson_summaries: summary + key points + study tip) */
  const usableSummary = input.summaries.find((s) => has(s.summary)) ?? null;
  const quickReview = state("quickReview", {
    present: !!usableSummary,
    status: usableSummary ? "READY" : input.summaries.length > 0 ? "INVALID" : "ABSENT",
    studentVisible: !!usableSummary,
    sourceRef: "lesson_summaries",
    count: usableSummary ? 1 : 0,
    updatedAt: latest(...input.summaries.map((s) => s.updated_at)),
    ...(!usableSummary && input.summaries.length > 0
      ? { note: "يوجد سجل ملخص لكنه فارغ" }
      : {}),
  });

  /* 7 — check understanding (lesson question bank via grade_lesson_quiz) */
  const checkUnderstanding = state("checkUnderstanding", {
    present: input.questionsCount > 0,
    status: input.questionsCount > 0 ? "READY" : "ABSENT",
    studentVisible: input.questionsCount > 0,
    sourceRef: "questions(lesson_id) → get_lesson_quiz_questions",
    count: input.questionsCount,
    updatedAt: null,
  });

  /* 8 — lesson assessment (formal card / exam template) */
  const assessCount = input.assessmentsCount + input.lessonExamCount;
  const lessonAssessment = state("lessonAssessment", {
    present: assessCount > 0,
    status: assessCount > 0 ? "READY" : "ABSENT",
    studentVisible: assessCount > 0 && gateOpen,
    sourceRef: "lesson_assessments + exam_templates(lesson_id)",
    count: assessCount,
    updatedAt: null,
  });

  /* 9 — student performance (derived, never authored) */
  const perfPresent = input.performanceTrackable !== false && (
    input.questionsCount > 0 || assessCount > 0
  );
  const studentPerformance = state("studentPerformance", {
    present: perfPresent,
    status: perfPresent ? "READY" : "ABSENT",
    studentVisible: perfPresent,
    sourceRef: "user_progress + practice/exam attempts (derived)",
    count: perfPresent ? 1 : 0,
    updatedAt: null,
  });

  /* 10 — original book PDF */
  const primaryPdf = input.resources.find(
    (r) => r.is_primary === true && isValidResourceUrl(r.url),
  );
  const bookPdf = input.bookContents.find((r) => has(r.pdf_url));
  const pdfPresent = !!primaryPdf || !!bookPdf;
  const originalBookPdf = state("originalBookPdf", {
    present: pdfPresent,
    status: pdfPresent ? "READY" : "ABSENT",
    studentVisible: pdfPresent && gateOpen,
    sourceRef: primaryPdf
      ? "lesson_resources(is_primary=true)"
      : "lesson_book_contents.pdf_url",
    count: pdfPresent ? 1 : 0,
    updatedAt: latest(primaryPdf?.created_at, bookPdf?.updated_at),
  });

  return {
    officialBookContent,
    tamkeenExplanation,
    mindMap,
    simulation,
    supportingResources,
    quickReview,
    checkUnderstanding,
    lessonAssessment,
    studentPerformance,
    originalBookPdf,
  };
}

/** Capabilities in official student order, unavailable ones removed entirely. */
export function studentVisibleContract(
  contract: LessonCapabilityContract,
): LessonCapabilityState[] {
  return STUDENT_CAPABILITY_ORDER.map((k) => contract[k]).filter(
    (c) => c.present && c.studentVisible && c.status === "READY",
  );
}

/* ------------------------------------------------------------------ */
/* Readiness (20B §6)                                                  */
/* ------------------------------------------------------------------ */

export interface LessonReadinessLevels {
  bookReady: boolean;
  learningReady: boolean;
  fullyReady: boolean;
  missing: LessonContentCapabilityKey[];
}

/**
 * BOOK_READY      = official book content present, valid and student visible.
 * LEARNING_READY  = BOOK_READY + explanation + quick review (mind map and
 *                   simulation are optional — never required for every lesson).
 * FULLY_READY     = LEARNING_READY + check-understanding questions.
 */
export function computeLessonReadinessLevels(
  contract: LessonCapabilityContract,
): LessonReadinessLevels {
  const ready = (k: LessonContentCapabilityKey) =>
    contract[k].present && contract[k].status === "READY";

  const bookReady = ready("officialBookContent");
  const learningReady = bookReady && ready("tamkeenExplanation") && ready("quickReview");
  const fullyReady = learningReady && ready("checkUnderstanding");

  const required: LessonContentCapabilityKey[] = [
    "officialBookContent",
    "tamkeenExplanation",
    "quickReview",
    "checkUnderstanding",
  ];

  return {
    bookReady,
    learningReady,
    fullyReady,
    missing: required.filter((k) => !ready(k)),
  };
}
