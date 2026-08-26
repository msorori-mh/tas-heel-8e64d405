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
 *
 * 21B4E — Content V3 alignment:
 *   The original textbook lives at SUBJECT x TRACK x SEMESTER level
 *   (`subject_textbooks`, opened from "كتب المنهج"). `originalBookPdf` is NO
 *   LONGER part of the student lesson journey, its ordering, progress or
 *   readiness. The key survives ONLY as an admin/legacy reference so existing
 *   rows keep rendering in the workspace — no data is deleted.
 */

/** 21B — the subject textbook is the primary original-book reference. */
export const SUBJECT_TEXTBOOK_PRIMARY_REFERENCE = true;
/** 21B4E — lesson-level PDF is admin/legacy reference only; never a student step. */
export const LESSON_PDF_LEGACY_COMPATIBILITY = false;

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

/**
 * 21B4E — capabilities that exist only as an admin/legacy reference. They are
 * never rendered as a student step, never ordered, never counted in progress
 * and never part of any readiness level. Their data is preserved as-is.
 */
export const LEGACY_REFERENCE_CAPABILITIES: readonly LessonContentCapabilityKey[] = [
  "originalBookPdf",
];

/**
 * 21B4E — the final Content V3 lesson journey. `originalBookPdf` is absent by
 * contract; `studentPerformance` is derived (not authored content).
 */
export const FINAL_LESSON_CAPABILITIES: readonly LessonContentCapabilityKey[] = [
  "officialBookContent",
  "tamkeenExplanation",
  "quickReview",
  "mindMap",
  "simulation",
  "supportingResources",
  "checkUnderstanding",
  "lessonAssessment",
];

/**
 * Official student rendering order (20B §3, 21B4E Content V3, 21G-B final V3).
 * Order mirrors `V3_STUDENT_ORDER` in `content-v3.ts`; supporting resources and
 * derived performance are appended after the seven V3 capabilities and are
 * never mandatory journey steps.
 */
export const STUDENT_CAPABILITY_ORDER: readonly LessonContentCapabilityKey[] = [
  "officialBookContent",
  "tamkeenExplanation",
  "quickReview",
  "mindMap",
  "simulation",
  "checkUnderstanding",
  "lessonAssessment",
  "supportingResources",
  "studentPerformance",
];

export const CAPABILITY_LABEL_AR: Record<LessonContentCapabilityKey, string> = {
  officialBookContent: "محتوى الكتاب الرسمي",
  tamkeenExplanation: "شرح تمكين",
  mindMap: "الخريطة الذهنية",
  simulation: "التجارب / النشاط التفاعلي",
  supportingResources: "الموارد المساعدة",
  quickReview: "ملخص الدرس",
  checkUnderstanding: "أسئلة الدرس",
  lessonAssessment: "اختبر فهمك",
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

/** 20B §1 — why a capability is not student-ready. */
export type CapabilityReadinessReason =
  | "NOT_ENTERED"
  | "DRAFT_NOT_PUBLISHED"
  | "INVALID_DATA"
  | "ACCESS_GATED";

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
  /**
   * 20B §1 — machine-readable reason the capability is not student-ready.
   * `null` when the capability is READY. Operator-facing only.
   */
  readinessReason: CapabilityReadinessReason | null;
}

export type LessonCapabilityContract = Record<LessonContentCapabilityKey, LessonCapabilityState>;

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
  /** Published OFFICIAL_BOOK_QUESTION revisions bound to this lesson. */
  officialQuestionsCount?: number;
  /** Published SELF_TEST revisions bound to this lesson. */
  selfTestQuestionsCount?: number;
  /** @deprecated Unclassified legacy question count. */
  questionsCount?: number;
  /** lesson_assessments rows. */
  assessmentsCount: number;
  /** exam_templates scoped to this lesson and active. */
  lessonExamCount?: number;
  /** Whether student progress/mistakes tracking can produce a signal. */
  performanceTrackable?: boolean;
  /** Enhancement access gate (subscription / free unit / admin). */
  enhancementsAccessible?: boolean;
  /**
   * 20C — editorial lifecycle rows (lesson_capability_lifecycle).
   * A missing entry means "legacy content", handled by 20B presence rules.
   * Any present entry is authoritative and FAIL-CLOSED: only READY may render.
   */
  lifecycle?: LessonLifecycleMap;
}

/** 20C editorial lifecycle. Students may only ever see READY. */
export type LessonCapabilityLifecycleStatus = "DRAFT" | "REVIEW" | "READY";

/**
 * 20C-B — a lifecycle row as the workspace sees it.
 * `hasReady` is retained for editorial/admin diagnostics. Student-facing
 * visibility is governed by the canonical RPC contract: only READY is
 * visible; a stored snapshot never upgrades DRAFT or REVIEW to visible.
 */
export interface LessonCapabilityLifecycleEntry {
  status: LessonCapabilityLifecycleStatus;
  hasReady?: boolean;
}

export type LessonLifecycleMap = Partial<
  Record<
    LessonContentCapabilityKey,
    LessonCapabilityLifecycleStatus | LessonCapabilityLifecycleEntry
  >
>;

export function normalizeLifecycleEntry(
  value: LessonCapabilityLifecycleStatus | LessonCapabilityLifecycleEntry | undefined,
): LessonCapabilityLifecycleEntry | null {
  if (!value) return null;
  return typeof value === "string" ? { status: value } : value;
}

/**
 * 20C-B — may the student render this capability, lifecycle-wise?
 *  - no row              → yes (legacy grandfathering)
 *  - READY               → yes
 *  - DRAFT/REVIEW        → no, even when a snapshot exists
 */
export function isLifecycleStudentVisible(
  value: LessonCapabilityLifecycleStatus | LessonCapabilityLifecycleEntry | undefined,
): boolean {
  const entry = normalizeLifecycleEntry(value);
  if (!entry) return true;
  return entry.status === "READY";
}

/** Capabilities that carry an editorial lifecycle (performance is derived). */
export const LIFECYCLE_CAPABILITIES: readonly LessonContentCapabilityKey[] =
  LESSON_CONTENT_CAPABILITIES.filter((k) => k !== "studentPerformance");

/**
 * 20C §2 — overlay the editorial lifecycle on top of the 20B presence contract.
 * Rules:
 *  - no lifecycle row  → unchanged (legacy grandfathering, no silent hiding)
 *  - READY             → unchanged (presence rules still apply)
 *  - DRAFT / REVIEW    → status DRAFT and hidden from students. A snapshot is
 *                        operator metadata, not a student visibility grant.
 */
export function applyLifecycleOverlay(
  contract: LessonCapabilityContract,
  lifecycle: LessonLifecycleMap = {},
): LessonCapabilityContract {
  const next = { ...contract };
  for (const key of LIFECYCLE_CAPABILITIES) {
    const entry = normalizeLifecycleEntry(lifecycle[key]);
    if (!entry || entry.status === "READY") continue;
    next[key] = {
      ...next[key],
      status: "DRAFT",
      studentVisible: false,
      readinessReason: "DRAFT_NOT_PUBLISHED",
      note:
        entry.status === "REVIEW"
          ? "قيد المراجعة — غير مرئي للطالب حتى الاعتماد"
          : "مسودة — غير مرئية للطالب حتى الاعتماد",
    };
  }
  return next;
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
  partial: Omit<LessonCapabilityState, "key" | "label" | "icon" | "readinessReason"> & {
    readinessReason?: CapabilityReadinessReason | null;
  },
): LessonCapabilityState {
  const derived: CapabilityReadinessReason | null =
    partial.status === "ABSENT"
      ? "NOT_ENTERED"
      : partial.status === "INVALID"
        ? "INVALID_DATA"
        : partial.status === "DRAFT"
          ? "DRAFT_NOT_PUBLISHED"
          : partial.studentVisible
            ? null
            : "ACCESS_GATED";

  return {
    key,
    label: CAPABILITY_LABEL_AR[key],
    icon: CAPABILITY_ICON_AR[key],
    ...partial,
    readinessReason: partial.readinessReason ?? derived,
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
    status: mindMapCount === 0 ? "ABSENT" : mindMapPublished.length > 0 ? "READY" : "DRAFT",
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
    ...(!usableSummary && input.summaries.length > 0 ? { note: "يوجد سجل ملخص لكنه فارغ" } : {}),
  });

  /* 7 — check understanding (V3 revision-pinned official question RPC) */
  const officialQuestionsCount = input.officialQuestionsCount ?? input.questionsCount ?? 0;
  const checkUnderstanding = state("checkUnderstanding", {
    present: officialQuestionsCount > 0,
    status: officialQuestionsCount > 0 ? "READY" : "ABSENT",
    studentVisible: officialQuestionsCount > 0,
    sourceRef: "questions(current_published_revision_id) → get_lesson_official_questions",
    count: officialQuestionsCount,
    updatedAt: null,
  });

  /* 8 — lesson assessment (formal card / exam template) */
  const selfTestCount =
    input.selfTestQuestionsCount ?? input.assessmentsCount + (input.lessonExamCount ?? 0);
  const lessonAssessment = state("lessonAssessment", {
    present: selfTestCount > 0,
    status: selfTestCount > 0 ? "READY" : "ABSENT",
    studentVisible: selfTestCount > 0 && gateOpen,
    sourceRef: "question_revisions(educational_label=SELF_TEST) → get_lesson_self_test_questions",
    count: selfTestCount,
    updatedAt: null,
  });

  /* 9 — student performance (derived, never authored) */
  const perfPresent =
    input.performanceTrackable !== false && (officialQuestionsCount > 0 || selfTestCount > 0);
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
    sourceRef: primaryPdf ? "lesson_resources(is_primary=true)" : "lesson_book_contents.pdf_url",
    count: pdfPresent ? 1 : 0,
    updatedAt: latest(primaryPdf?.created_at, bookPdf?.updated_at),
  });

  return applyLifecycleOverlay(
    {
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
    },
    input.lifecycle ?? {},
  );
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
  /** 21B4E — official book questions + self test. */
  assessmentReady: boolean;
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

  // 21B4E READINESS V3 — originalBookPdf never participates in any level.
  const bookReady = ready("officialBookContent");
  const learningReady =
    bookReady && ready("tamkeenExplanation") && ready("quickReview") && ready("mindMap");
  // GAP (Content V3): there is no REQUIRED/OPTIONAL/N-A flag per capability yet,
  // so the lab experiment (simulation) is treated as OPTIONAL for every lesson.
  const assessmentReady = ready("checkUnderstanding") && ready("lessonAssessment");
  const fullyReady = learningReady && assessmentReady;

  const required: LessonContentCapabilityKey[] = [
    "officialBookContent",
    "tamkeenExplanation",
    "quickReview",
    "mindMap",
    "checkUnderstanding",
    "lessonAssessment",
  ];

  return {
    bookReady,
    learningReady,
    assessmentReady,
    fullyReady,
    missing: required.filter((k) => !ready(k)),
  };
}

/* ------------------------------------------------------------------ */
/* 18B bridge (20B §5) — one decision source for visibility + order    */
/* ------------------------------------------------------------------ */

/**
 * Maps the legacy 18B capability types onto the canonical 20B capability
 * keys. Visibility is still decided once, by 18B `computeLessonCapabilities`;
 * ORDER is decided once, here. No component may re-implement either.
 */
export const LEGACY_CAPABILITY_TO_KEY: Record<string, LessonContentCapabilityKey> = {
  PRIMARY_CONTENT: "officialBookContent",
  EXPLANATION: "tamkeenExplanation",
  MINDMAP: "mindMap",
  PRACTICAL: "simulation",
  VIDEO: "supportingResources",
  EXTRA_RESOURCES: "supportingResources",
  SUMMARY: "quickReview",
  OFFICIAL_QUESTIONS: "checkUnderstanding",
  SELF_TEST: "lessonAssessment",
};

/**
 * Orders already-visible 18B capabilities by the canonical student order
 * (20B §4). Stable within a bucket (video before extra resources).
 * Anything unmapped is appended, never dropped and never labelled
 * "غير متوفر" — hidden capabilities were already filtered out upstream.
 */
export function orderStudentCapabilities<T extends { type: string }>(
  capabilities: readonly T[],
): T[] {
  const rank = (type: string) => {
    const key = LEGACY_CAPABILITY_TO_KEY[type];
    const index = key ? STUDENT_CAPABILITY_ORDER.indexOf(key) : -1;
    return index === -1 ? STUDENT_CAPABILITY_ORDER.length : index;
  };
  return capabilities
    .map((c, i) => ({ c, i, r: rank(c.type) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c);
}
