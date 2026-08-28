import { GOLDEN_CAPABILITIES, type GoldenLessonProfile } from "./golden-lesson-contract.ts";

export const GOLDEN_QURAN_V1: GoldenLessonProfile = {
  id: "GOLDEN_QURAN_V1",
  version: 1,
  labelAr: "الدرس الذهبي — القرآن الكريم",
  subjectFamily: "QURAN",
  capabilityOrder: GOLDEN_CAPABILITIES,
  /**
   * The profile still records which capabilities a complete lesson is expected to
   * carry. It is an editorial expectation, not an upload gate: every capability is
   * uploaded, reviewed and published on its own, and nothing waits for the rest.
   */
  applicability: {
    officialBookContent: "REQUIRED",
    tamkeenExplanationHtml: "REQUIRED",
    lessonSummaryHtml: "REQUIRED",
    mindMapHtml: "REQUIRED",
    labExperimentHtml: "OPTIONAL",
    officialBookQuestions: "REQUIRED",
    selfTest: "REQUIRED",
  },
  notesAr: [
    "النص الرسمي وأسئلته لا يعادان صياغتهما.",
    "كل مكوّن يُرفع ويُنشر وحده؛ لا ينتظر أي مكوّن اكتمال البقية.",
    "الوحدة اختيارية؛ لا تُخترع إذا كان الدرس مرتبطًا بالمادة مباشرة.",
  ],
};

export const GOLDEN_CHEMISTRY_V1: GoldenLessonProfile = {
  id: "GOLDEN_CHEMISTRY_V1",
  version: 1,
  labelAr: "الدرس الذهبي — الكيمياء",
  subjectFamily: "SCIENCE",
  capabilityOrder: GOLDEN_CAPABILITIES,
  /**
   * The profile still records which capabilities a complete lesson is expected to
   * carry. It is an editorial expectation, not an upload gate: every capability is
   * uploaded, reviewed and published on its own, and nothing waits for the rest.
   */
  applicability: {
    officialBookContent: "REQUIRED",
    tamkeenExplanationHtml: "REQUIRED",
    lessonSummaryHtml: "REQUIRED",
    mindMapHtml: "REQUIRED",
    labExperimentHtml: "OPTIONAL",
    officialBookQuestions: "REQUIRED",
    selfTest: "REQUIRED",
  },
  notesAr: [
    "المعادلات والجداول والأشكال الرسمية تحفظ كما وردت في الكتاب مع بصمة سلامة داخلية.",
    "كل مكوّن يُرفع ويُنشر وحده؛ المختبر وغيره يعمل داخل CSP بلا شبكة عند وجوده.",
    "إجابات اختبر فهمك وتعليلاته تُفصل آليًا من XLSX وتحفظ خادميًا؛ لا يرفع الفريق ملفًا منفصلًا.",
  ],
};

export const GOLDEN_LESSON_PROFILES = {
  [GOLDEN_QURAN_V1.id]: GOLDEN_QURAN_V1,
  [GOLDEN_CHEMISTRY_V1.id]: GOLDEN_CHEMISTRY_V1,
} as const;

export type GoldenLessonProfileId = keyof typeof GOLDEN_LESSON_PROFILES;

export function getGoldenLessonProfile(id: string): GoldenLessonProfile | undefined {
  return GOLDEN_LESSON_PROFILES[id as GoldenLessonProfileId];
}
