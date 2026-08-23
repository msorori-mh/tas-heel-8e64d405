import {
  GOLDEN_CAPABILITIES,
  GOLDEN_CAPABILITIES_V2,
  GOLDEN_LESSON_SCHEMA_V1,
  GOLDEN_LESSON_SCHEMA_V2,
  type GoldenLessonProfile,
} from "./golden-lesson-contract.ts";

export const GOLDEN_QURAN_V1: GoldenLessonProfile = {
  id: "GOLDEN_QURAN_V1",
  version: 1,
  schema: GOLDEN_LESSON_SCHEMA_V1,
  labelAr: "الدرس الذهبي — القرآن الكريم",
  subjectFamily: "QURAN",
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
    "النص الرسمي وأسئلته لا يعادان صياغتهما.",
    "التجربة أو النشاط التفاعلي اختياري وحده، ولا يمنع غيابه اعتماد بقية الدرس.",
    "الوحدة اختيارية؛ لا تُخترع إذا كان الدرس مرتبطًا بالمادة مباشرة.",
  ],
};

export const GOLDEN_CHEMISTRY_V1: GoldenLessonProfile = {
  id: "GOLDEN_CHEMISTRY_V1",
  version: 1,
  schema: GOLDEN_LESSON_SCHEMA_V1,
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
    "المعادلات والجداول والأشكال الرسمية تحفظ كما وردت في الكتاب مع بصمة سلامة داخلية.",
    "المختبر اختياري حسب الدرس، وعند وجوده يعمل داخل CSP بلا شبكة.",
    "الإجابات والتعليلات تُفصل آليًا من XLSX وتحفظ خادميًا؛ لا يرفع الفريق ملفًا منفصلًا.",
  ],
};

export const GOLDEN_QURAN_V2: GoldenLessonProfile = {
  id: "GOLDEN_QURAN_V2",
  version: 2,
  schema: GOLDEN_LESSON_SCHEMA_V2,
  labelAr: "الدرس الذهبي — القرآن الكريم — عقد الاستيراد v2",
  subjectFamily: "QURAN",
  capabilityOrder: GOLDEN_CAPABILITIES_V2,
  applicability: {
    officialBookContent: "REQUIRED",
    tamkeenExplanationHtml: "REQUIRED",
    lessonSummaryHtml: "REQUIRED",
    conceptsAndTermsHtml: "REQUIRED",
    equationsAndLawsHtml: "REQUIRED",
    officialBookQuestions: "REQUIRED",
    selfTest: "REQUIRED",
    interactiveActivityHtml: "OPTIONAL",
  },
  notesAr: [
    "المحتويات الخمسة الأولى HTML منظم؛ المعادلات يمكن تعليمها NA عند عدم الانطباق.",
    "أسئلة الكتاب واختبر فهمك تُحوّلان من XLSX إلى بيانات العرض العامة وملف إجابات خادمي.",
    "النشاط التفاعلي اختياري ولا يحل محل أي محتوى أساسي.",
  ],
};

export const GOLDEN_CHEMISTRY_V2: GoldenLessonProfile = {
  id: "GOLDEN_CHEMISTRY_V2",
  version: 2,
  schema: GOLDEN_LESSON_SCHEMA_V2,
  labelAr: "الدرس الذهبي — الكيمياء — عقد الاستيراد v2",
  subjectFamily: "SCIENCE",
  capabilityOrder: GOLDEN_CAPABILITIES_V2,
  applicability: {
    officialBookContent: "REQUIRED",
    tamkeenExplanationHtml: "REQUIRED",
    lessonSummaryHtml: "REQUIRED",
    conceptsAndTermsHtml: "REQUIRED",
    equationsAndLawsHtml: "REQUIRED",
    officialBookQuestions: "REQUIRED",
    selfTest: "REQUIRED",
    interactiveActivityHtml: "OPTIONAL",
  },
  notesAr: [
    "الصور والجداول والمعادلات في المحتوى الرسمي تُحفظ داخل HTML مع أصول مثبتة بالبصمة.",
    "المعادلات والقوانين HTML أو NA؛ لا يُنشأ ملف صوري بديل.",
    "اختبر فهمك أربعة خيارات، وإجاباته وتعليلاته في الرفيق الخادمي فقط.",
  ],
};

export const GOLDEN_LESSON_PROFILES = {
  [GOLDEN_QURAN_V1.id]: GOLDEN_QURAN_V1,
  [GOLDEN_CHEMISTRY_V1.id]: GOLDEN_CHEMISTRY_V1,
  [GOLDEN_QURAN_V2.id]: GOLDEN_QURAN_V2,
  [GOLDEN_CHEMISTRY_V2.id]: GOLDEN_CHEMISTRY_V2,
} as const;

export type GoldenLessonProfileId = keyof typeof GOLDEN_LESSON_PROFILES;

export function getGoldenLessonProfile(id: string): GoldenLessonProfile | undefined {
  return GOLDEN_LESSON_PROFILES[id as GoldenLessonProfileId];
}
