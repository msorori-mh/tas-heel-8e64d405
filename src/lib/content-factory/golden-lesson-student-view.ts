import {
  GOLDEN_LESSON_SCHEMA_V2,
  capabilitiesForGoldenLessonSchema,
  type GoldenCapability,
  type GoldenLessonPackage,
} from "./golden-lesson-contract.ts";

export type GoldenStudentRenderKind = "HTML" | "OFFICIAL_QUESTIONS" | "SELF_TEST";

export const GOLDEN_STUDENT_LABEL_AR: Record<GoldenCapability, string> = {
  officialBookContent: "محتوى الكتاب الرسمي",
  tamkeenExplanationHtml: "شرح تمكين",
  lessonSummaryHtml: "ملخص الدرس",
  mindMapHtml: "الخريطة الذهنية",
  conceptsAndTermsHtml: "المفاهيم والمصطلحات",
  equationsAndLawsHtml: "المعادلات والقوانين",
  officialBookQuestions: "أسئلة الكتاب الأصلية",
  selfTest: "اختبر فهمك",
  labExperimentHtml: "التجربة / النشاط",
  interactiveActivityHtml: "التجربة / النشاط التفاعلي",
};

export const GOLDEN_STUDENT_RENDER_KIND: Record<GoldenCapability, GoldenStudentRenderKind> = {
  officialBookContent: "HTML",
  tamkeenExplanationHtml: "HTML",
  lessonSummaryHtml: "HTML",
  mindMapHtml: "HTML",
  conceptsAndTermsHtml: "HTML",
  equationsAndLawsHtml: "HTML",
  officialBookQuestions: "OFFICIAL_QUESTIONS",
  selfTest: "SELF_TEST",
  labExperimentHtml: "HTML",
  interactiveActivityHtml: "HTML",
};

export interface GoldenStudentCapabilityView {
  order: number;
  capability: GoldenCapability;
  labelAr: string;
  renderKind: GoldenStudentRenderKind;
  sourcePath: string;
  compatibilityMode: "V1_LEGACY" | "V2_NATIVE";
}

/**
 * Fail-closed projection for the student. A manifest record is never enough:
 * the caller must explicitly supply capabilities proven READY by the lifecycle
 * layer. DRAFT, missing, NA and answer-companion data are never projected.
 */
export function buildGoldenLessonStudentJourney(
  pkg: GoldenLessonPackage,
  readyCapabilities: ReadonlySet<GoldenCapability>,
): GoldenStudentCapabilityView[] {
  if (pkg.security.publicPayloadContainsAnswers !== false) return [];
  const artifacts = new Map(pkg.artifacts.map((artifact) => [artifact.capability, artifact]));
  const compatibilityMode = pkg.schema === GOLDEN_LESSON_SCHEMA_V2 ? "V2_NATIVE" : "V1_LEGACY";

  return capabilitiesForGoldenLessonSchema(pkg.schema).flatMap((capability, index) => {
    const artifact = artifacts.get(capability);
    if (!artifact || artifact.applicability === "NA" || !artifact.sourcePath ||
        !readyCapabilities.has(capability)) return [];
    return [{
      order: index + 1,
      capability,
      labelAr: GOLDEN_STUDENT_LABEL_AR[capability],
      renderKind: GOLDEN_STUDENT_RENDER_KIND[capability],
      sourcePath: artifact.sourcePath,
      compatibilityMode,
    }];
  });
}
