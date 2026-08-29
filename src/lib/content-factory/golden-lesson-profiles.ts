import { GOLDEN_CAPABILITIES, type GoldenLessonProfile } from "./golden-lesson-contract.ts";

export const GOLDEN_QURAN_V1: GoldenLessonProfile = {
  id: "GOLDEN_QURAN_V1",
  version: 1,
  labelAr: "الدرس الذهبي — القرآن الكريم",
  subjectFamily: "QURAN",
  capabilityOrder: GOLDEN_CAPABILITIES,
  /**
   * No capability is mandatory. Each of the seven is uploaded, reviewed and published
   * entirely on its own, so there is no state in which one of them is owed before
   * another may go out. A lesson with only a mind map published is a complete, correct
   * lesson that happens to have one component so far.
   *
   * The field is kept because the manifest, the lifecycle rows and CF10 all carry it,
   * and because NA still means something different from OPTIONAL: not applicable to
   * this subject at all, rather than simply not uploaded yet.
   */
  applicability: {
    officialBookContent: "OPTIONAL",
    tamkeenExplanationHtml: "OPTIONAL",
    lessonSummaryHtml: "OPTIONAL",
    mindMapHtml: "OPTIONAL",
    labExperimentHtml: "OPTIONAL",
    officialBookQuestions: "OPTIONAL",
    selfTest: "OPTIONAL",
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
   * No capability is mandatory. Each of the seven is uploaded, reviewed and published
   * entirely on its own, so there is no state in which one of them is owed before
   * another may go out. A lesson with only a mind map published is a complete, correct
   * lesson that happens to have one component so far.
   *
   * The field is kept because the manifest, the lifecycle rows and CF10 all carry it,
   * and because NA still means something different from OPTIONAL: not applicable to
   * this subject at all, rather than simply not uploaded yet.
   */
  applicability: {
    officialBookContent: "OPTIONAL",
    tamkeenExplanationHtml: "OPTIONAL",
    lessonSummaryHtml: "OPTIONAL",
    mindMapHtml: "OPTIONAL",
    labExperimentHtml: "OPTIONAL",
    officialBookQuestions: "OPTIONAL",
    selfTest: "OPTIONAL",
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
