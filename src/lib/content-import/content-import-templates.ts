/**
 * Static metadata for lesson content Excel templates (01–10). No file I/O.
 *
 * Column contracts are NOT declared here: requiredColumns / knownColumns and the
 * duplicate-key configuration are derived from IMPORT_ENTITY_CONTRACTS so that
 * Validate can never accept a file that Execute would reject.
 */
import {
  IMPORT_ENTITY_CONTRACTS,
  IMPORT_EXECUTION_ORDER,
  requiredTemplateColumnsForEntity,
  templateColumnsForEntity,
} from "../import/import-contract.ts";
import type {
  ContentImportTemplateKey,
  ContentImportTemplateKey as TemplateKey,
} from "./content-import-template-keys.ts";

export interface ContentImportTemplateMeta {
  order: number;
  key: ContentImportTemplateKey;
  titleAr: string;
  filename: string;
  /** Exact worksheet containing import rows. Never infer this from workbook order. */
  dataSheetName: string;
  descriptionAr: string;
  /** Required columns for UI + dry-run validation — derived from the import contract. */
  readonly requiredBaseColumns: readonly string[];
  editorOnly?: boolean;
}

export {
  CONTENT_IMPORT_TEMPLATE_KEYS,
  type ContentImportTemplateKey,
} from "./content-import-template-keys.ts";

export interface ContentImportDryRunConfig {
  requiredColumns: readonly string[];
  knownColumns: readonly string[];
  duplicateKeyColumn?: string;
  compositeDuplicateKeys?: readonly string[];
  infoWarnings: readonly string[];
}

export const CONTENT_IMPORT_TEMPLATE_BASE_PATH = "/content-import-templates";

const TEMPLATE_META: Omit<ContentImportTemplateMeta, "requiredBaseColumns">[] = [
  {
    order: 1,
    key: "subjects",
    titleAr: "المواد الدراسية",
    filename: "01_subjects_template.xlsx",
    dataSheetName: "المواد",
    descriptionAr: "تعريف المواد (كود، صف، منهج، أيقونة، لون).",
  },
  {
    order: 2,
    key: "units",
    titleAr: "الوحدات",
    filename: "02_units_template.xlsx",
    dataSheetName: "الوحدات",
    descriptionAr: "وحدات كل مادة مع الربط بـ subject_code.",
  },
  {
    order: 3,
    key: "lessons",
    titleAr: "الدروس",
    filename: "03_lessons_template.xlsx",
    dataSheetName: "الدروس",
    descriptionAr: "قائمة الدروس — lesson_code يُستخدم في القوالب التالية.",
  },
  {
    order: 4,
    key: "book_contents",
    titleAr: "محتوى الكتاب",
    filename: "04_lesson_book_contents_template.xlsx",
    dataSheetName: "محتوى الكتاب",
    descriptionAr: "نص الدرس الرئيسي (Markdown) وربط PDF اختياري.",
  },
  {
    order: 5,
    key: "explanations",
    titleAr: "الشروحات",
    filename: "05_lesson_explanations_template.xlsx",
    dataSheetName: "الشروحات",
    descriptionAr: "شروحات إضافية متعددة لكل درس.",
  },
  {
    order: 6,
    key: "resources",
    titleAr: "الموارد والروابط",
    filename: "06_lesson_resources_template.xlsx",
    dataSheetName: "موارد الدرس",
    descriptionAr: "فيديو، خريطة ذهنية، تجربة، PDF، وروابط خارجية.",
  },
  {
    order: 7,
    key: "assessments",
    titleAr: "تقييمات الدروس",
    filename: "07_lesson_assessments_template.xlsx",
    dataSheetName: "اختبارات الدرس",
    descriptionAr: "اختبارات قصيرة مرتبطة بدرس (قبل ربط الأسئلة في 08).",
  },
  {
    order: 8,
    key: "assessment_questions",
    titleAr: "أسئلة التقييمات",
    filename: "08_assessment_questions_template.xlsx",
    dataSheetName: "أسئلة الاختبار",
    descriptionAr: "ربط أسئلة (من 09) باختبار (من 07).",
    editorOnly: true,
  },
  {
    order: 9,
    key: "questions",
    titleAr: "أسئلة الكتاب الأصلية",
    filename: "09_official_book_questions_template.xlsx",
    dataSheetName: "أسئلة الكتاب الأصلية",
    descriptionAr: "أسئلة الدرس بصيغتها الأصلية في الكتاب مع الإجابة النموذجية.",
    editorOnly: true,
  },
  {
    order: 10,
    key: "self_test_questions",
    titleAr: "اختبر فهمك",
    filename: "10_self_test_questions_template.xlsx",
    dataSheetName: "اختبر فهمك",
    descriptionAr: "بنك اختيار من متعدد مستقل مع الإجابة الصحيحة والشرح والتصويبات.",
    editorOnly: true,
  },
];

export const CONTENT_IMPORT_TEMPLATES: ContentImportTemplateMeta[] = TEMPLATE_META.map((meta) => ({
  ...meta,
  requiredBaseColumns: requiredTemplateColumnsForEntity(meta.key),
}));

const TEMPLATE_ORDER_BY_KEY = Object.fromEntries(
  CONTENT_IMPORT_TEMPLATES.map((t) => [t.key, t.order]),
) as Record<TemplateKey, number>;

/** Canonical operator order — derived from IMPORT_EXECUTION_ORDER, never hand-written. */
export const CONTENT_IMPORT_WORKFLOW_ORDER: string = IMPORT_EXECUTION_ORDER.map((key) =>
  String(TEMPLATE_ORDER_BY_KEY[key]).padStart(2, "0"),
).join(" → ");

export interface ContentImportWorkflowStep {
  /** Template key when the step is a template, null for review/publish gates. */
  key: TemplateKey | null;
  label: string;
  gate: boolean;
}

/**
 * Full operator pipeline shown at the top of the import center.
 * Template steps come from IMPORT_EXECUTION_ORDER (single source); the review
 * and publish gates are inserted before the assessment-binding template, which
 * cannot run until questions are reviewed and published.
 */
export const CONTENT_IMPORT_WORKFLOW_STEPS: ContentImportWorkflowStep[] =
  IMPORT_EXECUTION_ORDER.flatMap((key) => {
    const meta = getContentImportTemplateByKey(key);
    const step: ContentImportWorkflowStep = {
      key,
      label: `${String(meta.order).padStart(2, "0")} ${meta.titleAr}`,
      gate: false,
    };
    return key === "assessment_questions"
      ? [{ key: null, label: "مراجعة", gate: true }, { key: null, label: "نشر", gate: true }, step]
      : [step];
  });

const INFO_WARNINGS: Record<TemplateKey, readonly string[]> = {
  subjects: ["subjects.slug يُشتق تلقائياً من subject_code — لا تضِف عمود slug."],
  units: [],
  lessons: [
    "lesson_code هو نفسه lessons.slug — فريد داخل المادة الواحدة.",
    "اترك unit_code فارغاً إذا كان الدرس مرتبطاً بالمادة مباشرة.",
  ],
  book_contents: ["subject_code + lesson_code معاً يحددان الدرس بدقة.", "صف واحد فقط لكل درس."],
  explanations: [
    "subject_code + lesson_code معاً يحددان الدرس بدقة.",
    "explanation_code هو هوية الشرح الثابتة — لا تستخدم sort_order كهوية.",
  ],
  resources: [
    "subject_code + lesson_code معاً يحددان الدرس بدقة.",
    "resource_code هو هوية المورد الثابتة — لا تستخدم sort_order كهوية.",
    "resource_type المسموح: video | mindmap | experiment | pdf | link.",
    "resource_url إلزامي لكل مورد.",
  ],
  assessments: [
    "subject_code + lesson_code معاً يحددان الدرس بدقة.",
    "assessment_code فريد على مستوى المنصة كلها.",
  ],
  assessment_questions: ["لا يعمل هذا القالب إلا بعد مراجعة ونشر أسئلة «اختبر فهمك» من القالب 10."],
  questions: [
    "هذا القالب لأسئلة الكتاب الأصلية فقط؛ يحفظ النص كما ورد في الكتاب.",
    "وجود خيارات في سؤال كتاب أصلي لا ينقله إلى «اختبر فهمك».",
    "model_answer للمحررين ويظهر للطالب فقط بعد محاولته.",
  ],
  self_test_questions: [
    "هذا القالب لـ«اختبر فهمك» فقط، وكل أسئلته اختيار من متعدد.",
    "correct_index يبدأ من 1 في Excel ولا يظهر في الحمولة الأولية للطالب.",
    "explanation إلزامي ويظهر بعد اختيار الطالب، ويمكن إضافة تصويب خاص لكل خيار خاطئ.",
  ],
};

function buildDryRunConfig(key: TemplateKey): ContentImportDryRunConfig {
  const naturalKey = IMPORT_ENTITY_CONTRACTS[key].naturalKey;
  const base = {
    requiredColumns: requiredTemplateColumnsForEntity(key),
    knownColumns: templateColumnsForEntity(key),
    infoWarnings: INFO_WARNINGS[key],
  };
  return naturalKey.length === 1
    ? { ...base, duplicateKeyColumn: naturalKey[0] }
    : { ...base, compositeDuplicateKeys: naturalKey };
}

const DRY_RUN_CONFIG: Record<TemplateKey, ContentImportDryRunConfig> = Object.fromEntries(
  (Object.keys(IMPORT_ENTITY_CONTRACTS) as TemplateKey[]).map((key) => [
    key,
    buildDryRunConfig(key),
  ]),
) as Record<TemplateKey, ContentImportDryRunConfig>;

/**
 * Workflow display order — the single canonical order, derived from the
 * dependency graph in IMPORT_ENTITY_CONTRACTS (01…07 → 09 → 10 → review/publish → 08).
 */
export const CONTENT_IMPORT_TEMPLATES_DISPLAY_ORDER: ContentImportTemplateMeta[] =
  IMPORT_EXECUTION_ORDER.map((key) => getContentImportTemplateByKey(key));

export function contentImportTemplateDownloadUrl(filename: string): string {
  return `${CONTENT_IMPORT_TEMPLATE_BASE_PATH}/${filename}`;
}

export function getContentImportTemplateByKey(
  key: ContentImportTemplateKey,
): ContentImportTemplateMeta {
  const template = CONTENT_IMPORT_TEMPLATES.find((t) => t.key === key);
  if (!template) {
    throw new Error(`Unknown content import template key: ${key}`);
  }
  return template;
}

export function getContentImportDryRunConfig(
  key: ContentImportTemplateKey,
): ContentImportDryRunConfig {
  return DRY_RUN_CONFIG[key];
}
