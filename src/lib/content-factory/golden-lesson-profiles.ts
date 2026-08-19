import {
  GOLDEN_CAPABILITIES,
  type GoldenLessonProfile,
} from "./golden-lesson-contract.ts";

export const GOLDEN_QURAN_V1: GoldenLessonProfile = {
  id: "GOLDEN_QURAN_V1",
  version: 1,
  labelAr: "الدرس الذهبي — القرآن الكريم",
  subjectFamily: "QURAN",
  capabilityOrder: GOLDEN_CAPABILITIES,
  applicability: {
    officialBookContent: "REQUIRED",
    tamkeenExplanationHtml: "REQUIRED",
    lessonSummaryHtml: "REQUIRED",
    mindMapHtml: "OPTIONAL",
    labExperimentHtml: "NA",
    officialBookQuestions: "REQUIRED",
    selfTest: "OPTIONAL",
  },
  notesAr: [
    "النص الرسمي وأسئلته لا يعادان صياغتهما.",
    "النشاط المختبري غير منطبق، ولا ينشأ له محتوى أو lifecycle READY.",
    "الوحدة اختيارية؛ لا تُخترع إذا كان الدرس مرتبطًا بالمادة مباشرة.",
  ],
};

export const GOLDEN_CHEMISTRY_V1: GoldenLessonProfile = {
  id: "GOLDEN_CHEMISTRY_V1",
  version: 1,
  labelAr: "الدرس الذهبي — الكيمياء",
  subjectFamily: "SCIENCE",
  capabilityOrder: GOLDEN_CAPABILITIES,
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
    "المعادلات والجداول والأشكال الرسمية تحفظ مع provenance وSHA-256.",
    "المختبر اختياري حسب الدرس، وعند وجوده يعمل داخل CSP بلا شبكة.",
    "الإجابات والتبريرات تحفظ في companion خادمي مرتبط بالـrevision.",
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
