import type { LessonCapabilityType } from "./lesson-capabilities";
import type {
  LessonCapabilityLifecycleStatus,
  LessonContentCapabilityKey,
} from "./lesson-content-contract";

/**
 * The admin lesson list is a compact Content V3 matrix. Keep this list aligned
 * with the seven authored lesson components; legacy extras (video/resources)
 * are intentionally not lesson capabilities.
 */
export const ADMIN_LESSON_CAPABILITY_COLUMNS = [
  {
    type: "PRIMARY_CONTENT",
    lifecycleKey: "officialBookContent",
    label: "محتوى الكتاب",
  },
  {
    type: "EXPLANATION",
    lifecycleKey: "tamkeenExplanation",
    label: "شرح تمكين",
  },
  {
    type: "SUMMARY",
    lifecycleKey: "quickReview",
    label: "ملخص الدرس",
  },
  {
    type: "MINDMAP",
    lifecycleKey: "mindMap",
    label: "الخريطة الذهنية",
  },
  {
    type: "PRACTICAL",
    lifecycleKey: "simulation",
    label: "التجربة المعملية",
  },
  {
    type: "OFFICIAL_QUESTIONS",
    lifecycleKey: "checkUnderstanding",
    label: "أسئلة الكتاب",
  },
  {
    type: "SELF_TEST",
    lifecycleKey: "lessonAssessment",
    label: "اختبر فهمك",
  },
] as const satisfies readonly {
  type: LessonCapabilityType;
  lifecycleKey: LessonContentCapabilityKey;
  label: string;
}[];

export type AdminLessonCapabilityIndicator =
  | "AVAILABLE"
  | "DRAFT"
  | "REVIEW"
  | "CONFLICT"
  | "ABSENT";

/**
 * Lifecycle is authoritative when it exists. Legacy content without lifecycle
 * rows remains visible as available, while READY without backing content is an
 * explicit data conflict instead of a misleading green check.
 */
export function resolveAdminLessonCapabilityIndicator(input: {
  available: boolean;
  lifecycleStatus?: LessonCapabilityLifecycleStatus;
}): AdminLessonCapabilityIndicator {
  if (input.lifecycleStatus === "DRAFT") return "DRAFT";
  if (input.lifecycleStatus === "REVIEW") return "REVIEW";
  if (input.available) return "AVAILABLE";
  if (input.lifecycleStatus === "READY") return "CONFLICT";
  return "ABSENT";
}
