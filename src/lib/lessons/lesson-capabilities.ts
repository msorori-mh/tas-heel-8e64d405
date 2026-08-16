/**
 * LESSON_DYNAMIC_CAPABILITY_AND_STUDENT_UX_FIX_18B
 *
 * Single source of truth for "what can a student actually do in this lesson".
 * Pure logic: no React, no DB access, no side effects. Consumed by both the
 * student lesson page and the admin readiness signal so the two can never
 * disagree.
 *
 * Governing rules:
 *   - A capability that is not backed by valid, student-accessible content
 *     does NOT exist. No card, no step number, no "غير متوفر" row.
 *   - No capability is implied by subject type. Only real content counts.
 *   - `available` (content exists) is separate from `trackable`
 *     (we own a reliable completion signal). Progress uses trackable only.
 */

export const LESSON_CAPABILITY_TYPES = [
  "PRIMARY_CONTENT",
  "SUMMARY",
  "EXPLANATION",
  "MINDMAP",
  "PRACTICAL",
  "VIDEO",
  "ASSESSMENT",
  "LESSON_EXAM",
  "EXTRA_RESOURCES",
] as const;

export type LessonCapabilityType = (typeof LESSON_CAPABILITY_TYPES)[number];

export type LessonCapabilitySource =
  | "book_content"
  | "primary_resource"
  | "html_resource"
  | "resource"
  | "simulation"
  | "summary_row"
  | "explanation_row"
  | "quiz_rpc"
  | "exam_template"
  | "none";

export type LessonReadinessIssue =
  | "PRIMARY_CONTENT_MISSING"
  | "PRIMARY_RESOURCE_INVALID"
  | "DELIVERY_MODE_MISMATCH"
  | "CONTENT_NOT_STUDENT_VISIBLE";

export interface LessonCapability {
  type: LessonCapabilityType;
  /** Real, valid content exists for this capability. */
  available: boolean;
  /** The signed-in student may actually reach it (access gates applied). */
  studentVisible: boolean;
  /** We own a reliable completion signal for it. */
  trackable: boolean;
  /** Completion state — only meaningful when `trackable` is true. */
  completed: boolean;
  label: string;
  /** CTA verb shown to the student. */
  action: string;
  description: string;
  source: LessonCapabilitySource;
  /** Operator-facing data-consistency note; never shown to the student. */
  readinessIssue?: LessonReadinessIssue;
  /** How many concrete items back this capability (resources, questions…). */
  count: number;
}

/* ------------------------------------------------------------------ */
/* Input contract                                                      */
/* ------------------------------------------------------------------ */

export interface CapabilityResourceInput {
  id: string;
  resource_type: string | null;
  title: string | null;
  url: string;
  description?: string | null;
}

export interface LessonCapabilityInput {
  deliveryMode: string | null | undefined;
  bookContent: string | null | undefined;
  /** Legacy inline lesson text (`lessons.content_text`). */
  inlineContent?: string | null | undefined;
  primaryResource: CapabilityResourceInput | null | undefined;
  /** Non-primary resources already fetched for this lesson. */
  resources: readonly CapabilityResourceInput[];
  simulationsCount: number;
  htmlMindMapsCount: number;
  htmlExperimentsCount: number;
  htmlSummariesCount: number;
  summaryText: string | null | undefined;
  explanationsCount: number;
  questionsCount: number;
  lessonExamCount: number;
  hasLessonVideoFlag?: boolean;
  /** Enhancement gate result (subscription / free unit / admin). */
  enhancementsAccessible: boolean;
  progress?: {
    completed: boolean;
    quizScore: number | null;
  } | null;
}

/* ------------------------------------------------------------------ */
/* URL validity                                                        */
/* ------------------------------------------------------------------ */

/**
 * A resource row exists in the DB — that alone never makes it usable.
 * Accepts external http(s), managed storage refs, and internal lesson media.
 */
export function isValidResourceUrl(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim();
  if (!value) return false;
  if (value.startsWith("supabase-storage://")) return value.length > "supabase-storage://".length;
  if (value.startsWith("lesson-internal://")) return value.length > "lesson-internal://".length;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hasText(value: string | null | undefined): boolean {
  return (value ?? "").trim().length > 0;
}

function validResources(
  resources: readonly CapabilityResourceInput[] | undefined,
  type: string,
): CapabilityResourceInput[] {
  return (resources ?? []).filter((r) => r.resource_type === type && isValidResourceUrl(r.url));
}

/* ------------------------------------------------------------------ */
/* Capability computation                                              */
/* ------------------------------------------------------------------ */

function primaryContentCapability(input: LessonCapabilityInput): LessonCapability {
  const isExternalMode = input.deliveryMode === "external_resource";
  const bookText = hasText(input.bookContent) ? input.bookContent : input.inlineContent;
  const hasBook = hasText(bookText);
  const primary = input.primaryResource ?? null;
  const primaryValid = !!primary && isValidResourceUrl(primary.url);

  const base = {
    type: "PRIMARY_CONTENT" as const,
    trackable: true,
    completed: input.progress?.completed === true,
    label: "محتوى الدرس",
    count: 1,
  };

  // In-app text wins as the single primary action; a primary resource that also
  // exists is attached inside the same card, never as a second entry point.
  if (hasBook && !isExternalMode) {
    return {
      ...base,
      available: true,
      studentVisible: true,
      label: "اقرأ الدرس",
      action: "ابدأ القراءة",
      description: "ابدأ بقراءة محتوى الدرس من الكتاب المدرسي.",
      source: "book_content",
    };
  }

  if (primaryValid) {
    const visible = input.enhancementsAccessible;
    const capability: LessonCapability = {
      ...base,
      available: true,
      studentVisible: visible,
      label: "افتح الدرس",
      action: "افتح ملف الدرس",
      description: "محتوى هذا الدرس متوفر كملف — افتحه لمتابعة الدرس كاملاً.",
      source: "primary_resource",
    };
    if (!visible) capability.readinessIssue = "CONTENT_NOT_STUDENT_VISIBLE";
    // The resource carries the lesson while delivery_mode still says in-app:
    // the student is never blocked, but the operator must see the mismatch.
    else if (!isExternalMode) capability.readinessIssue = "DELIVERY_MODE_MISMATCH";
    return capability;
  }

  if (hasBook) {
    // External mode with no usable resource, but inline text exists — serve it.
    return {
      ...base,
      available: true,
      studentVisible: true,
      label: "اقرأ الدرس",
      action: "ابدأ القراءة",
      description: "ابدأ بقراءة محتوى الدرس من الكتاب المدرسي.",
      source: "book_content",
      readinessIssue: primary ? "PRIMARY_RESOURCE_INVALID" : "DELIVERY_MODE_MISMATCH",
    };
  }

  return {
    ...base,
    available: false,
    studentVisible: false,
    completed: false,
    action: "غير متوفر",
    description: "محتوى الدرس لم يُضف بعد.",
    source: "none",
    readinessIssue: primary ? "PRIMARY_RESOURCE_INVALID" : "PRIMARY_CONTENT_MISSING",
  };
}

function enhancement(
  type: LessonCapabilityType,
  count: number,
  source: LessonCapabilitySource,
  label: string,
  action: string,
  description: string,
  input: LessonCapabilityInput,
  options?: { trackable?: boolean; completed?: boolean; requiresEnhancementAccess?: boolean },
): LessonCapability {
  const available = count > 0;
  const gated = options?.requiresEnhancementAccess !== false;
  return {
    type,
    available,
    studentVisible: available && (!gated || input.enhancementsAccessible),
    trackable: available && options?.trackable === true,
    completed: options?.completed === true,
    label,
    action,
    description,
    source: available ? source : "none",
    count,
  };
}

/**
 * Builds the full capability set for a lesson. Unavailable capabilities are
 * returned too (the admin surface needs them); the student UI renders only
 * `available && studentVisible` entries via `visibleLessonCapabilities`.
 */
export function computeLessonCapabilities(input: LessonCapabilityInput): LessonCapability[] {
  const mindmapCount = input.htmlMindMapsCount + validResources(input.resources, "mindmap").length;
  const practicalCount =
    input.htmlExperimentsCount +
    validResources(input.resources, "experiment").length +
    Math.max(0, input.simulationsCount);
  const videoCount =
    validResources(input.resources, "video").length + (input.hasLessonVideoFlag ? 1 : 0);
  const summaryCount = (hasText(input.summaryText) ? 1 : 0) + input.htmlSummariesCount;
  const extrasCount =
    validResources(input.resources, "pdf").filter((r) => r.id !== input.primaryResource?.id)
      .length + validResources(input.resources, "link").length;

  return [
    primaryContentCapability(input),
    enhancement(
      "SUMMARY",
      summaryCount,
      hasText(input.summaryText) ? "summary_row" : "html_resource",
      "راجع الملخص",
      "عرض الملخص",
      "أهم النقاط والأفكار الرئيسية للدرس.",
      input,
      { requiresEnhancementAccess: false },
    ),
    enhancement(
      "EXPLANATION",
      Math.max(0, input.explanationsCount),
      "explanation_row",
      "شرح إضافي",
      "اقرأ الشرح",
      "شروحات إضافية تبسّط أفكار الدرس.",
      input,
      { requiresEnhancementAccess: false },
    ),
    enhancement(
      "MINDMAP",
      mindmapCount,
      input.htmlMindMapsCount > 0 ? "html_resource" : "resource",
      "الخريطة الذهنية",
      "عرض الخريطة",
      "خريطة ذهنية لتنظيم أفكار الدرس.",
      input,
    ),
    enhancement(
      "PRACTICAL",
      practicalCount,
      input.htmlExperimentsCount > 0 ? "html_resource" : "resource",
      "التجربة العملية",
      "ابدأ التجربة",
      "تطبيق عملي لمفاهيم الدرس.",
      input,
    ),
    enhancement(
      "VIDEO",
      videoCount,
      "resource",
      "شرح بالفيديو",
      "مشاهدة الشرح",
      "شرح مرئي لمحتوى الدرس.",
      input,
    ),
    enhancement(
      "ASSESSMENT",
      Math.max(0, input.questionsCount),
      "quiz_rpc",
      "اختبر فهمك",
      "حل الأسئلة",
      "أسئلة تفاعلية للتأكد من فهمك.",
      input,
      {
        trackable: true,
        completed: typeof input.progress?.quizScore === "number",
        requiresEnhancementAccess: false,
      },
    ),
    enhancement(
      "LESSON_EXAM",
      Math.max(0, input.lessonExamCount),
      "exam_template",
      "اختبار الدرس",
      "ابدأ الاختبار",
      "اختبار شامل لقياس إتقانك للدرس.",
      input,
    ),
    enhancement(
      "EXTRA_RESOURCES",
      extrasCount,
      "resource",
      "موارد إضافية",
      "استعراض الموارد",
      "ملفات وروابط داعمة لهذا الدرس.",
      input,
    ),
  ];
}

/** Ordered list of what the student can actually do — the rendering contract. */
export function visibleLessonCapabilities(
  capabilities: readonly LessonCapability[],
): LessonCapability[] {
  return capabilities.filter((c) => c.available && c.studentVisible);
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export interface LessonProgressSummary {
  numerator: number;
  denominator: number;
  percent: number;
  /** False when no available capability has a reliable completion signal. */
  measurable: boolean;
}

/**
 * Denominator = available AND trackable capabilities only.
 * Never a fixed step count, and never inflated by absent activities.
 */
export function computeLessonProgress(
  capabilities: readonly LessonCapability[],
): LessonProgressSummary {
  const tracked = capabilities.filter((c) => c.available && c.studentVisible && c.trackable);
  const denominator = tracked.length;
  const numerator = tracked.filter((c) => c.completed).length;
  return {
    numerator,
    denominator,
    percent: denominator === 0 ? 0 : Math.round((numerator / denominator) * 100),
    measurable: denominator > 0,
  };
}

/* ------------------------------------------------------------------ */
/* Admin readiness                                                     */
/* ------------------------------------------------------------------ */

export type LessonReadinessReason = "READY" | LessonReadinessIssue;

export interface LessonReadiness {
  studentReady: boolean;
  reason: LessonReadinessReason;
  /** Non-blocking data-consistency warnings for the operator. */
  warnings: LessonReadinessIssue[];
  availableCapabilities: LessonCapabilityType[];
}

export const LESSON_READINESS_REASON_AR: Record<LessonReadinessReason, string> = {
  READY: "جاهز للطالب",
  PRIMARY_CONTENT_MISSING: "لا يوجد محتوى أساسي للدرس",
  PRIMARY_RESOURCE_INVALID: "المورد الأساسي غير صالح",
  DELIVERY_MODE_MISMATCH: "عدم تطابق نمط التسليم مع المحتوى",
  CONTENT_NOT_STUDENT_VISIBLE: "المحتوى الأساسي غير ظاهر للطالب",
};

export const LESSON_CAPABILITY_LABEL_AR: Record<LessonCapabilityType, string> = {
  PRIMARY_CONTENT: "محتوى أساسي",
  SUMMARY: "ملخص",
  EXPLANATION: "شرح",
  MINDMAP: "خريطة ذهنية",
  PRACTICAL: "تجربة عملية",
  VIDEO: "فيديو",
  ASSESSMENT: "أسئلة",
  LESSON_EXAM: "اختبار",
  EXTRA_RESOURCES: "موارد",
};

/**
 * STUDENT_READY = a valid, student-accessible primary content exists.
 * Summary / video / mindmap / assessment are enhancements, never a condition.
 */
export function computeLessonReadiness(capabilities: readonly LessonCapability[]): LessonReadiness {
  const primary = capabilities.find((c) => c.type === "PRIMARY_CONTENT");
  const availableCapabilities = capabilities.filter((c) => c.available).map((c) => c.type);

  const warnings = capabilities
    .map((c) => c.readinessIssue)
    .filter((issue): issue is LessonReadinessIssue => !!issue);

  const ready = !!primary && primary.available && primary.studentVisible;
  const blocking = warnings.find(
    (w) =>
      w === "PRIMARY_CONTENT_MISSING" ||
      w === "PRIMARY_RESOURCE_INVALID" ||
      w === "CONTENT_NOT_STUDENT_VISIBLE",
  );

  return {
    studentReady: ready,
    reason: ready ? "READY" : (blocking ?? "PRIMARY_CONTENT_MISSING"),
    warnings,
    availableCapabilities,
  };
}

/* ------------------------------------------------------------------ */
/* Title presentation (display-only, fail-safe)                        */
/* ------------------------------------------------------------------ */

export interface LessonTitleParts {
  /** Small contextual line ("الفصل الأول · الحفظ والتفسير · الدرس الأول"). */
  context: string | null;
  /** Short headline shown as the H1 and in the breadcrumb. */
  main: string;
}

const TITLE_SEPARATOR = /\s*[-–—]\s+|\s+[-–—]\s*/;

/**
 * Splits an imported hierarchical title for display only. Never used for
 * access, ordering, identity, or unit semantics. Any title it cannot parse is
 * returned unchanged.
 */
export function parseLessonTitle(rawTitle: string | null | undefined): LessonTitleParts {
  const title = (rawTitle ?? "").trim();
  if (!title) return { context: null, main: "الدرس" };

  const segments = title
    .split(TITLE_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (segments.length < 3) return { context: null, main: title };

  const main = segments[segments.length - 1]!;
  const context = segments.slice(0, -1).join(" · ");

  // Fail safe: a headline that is too short to stand alone keeps the full title.
  if (main.length < 4) return { context: null, main: title };

  return { context, main };
}
