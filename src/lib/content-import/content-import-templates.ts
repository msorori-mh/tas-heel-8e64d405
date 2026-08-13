/**
 * Static metadata for lesson content Excel templates (01–09). No file I/O.
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
import type { ContentImportTemplateKey as TemplateKey } from "./content-import-template-keys.ts";

export interface ContentImportTemplateMeta {
  order: number;
  key: ContentImportTemplateKey;
  titleAr: string;
  filename: string;
  descriptionAr: string;
  /** Required columns for UI + dry-run validation. */
  requiredBaseColumns: readonly string[];
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

/** Canonical operator order — derived from IMPORT_EXECUTION_ORDER, never hand-written. */
export const CONTENT_IMPORT_WORKFLOW_ORDER: string = IMPORT_EXECUTION_ORDER.map(
  (key) => String(CONTENT_IMPORT_TEMPLATE_ORDER_BY_KEY[key]).padStart(2, "0"),
).join(" → ");

export const CONTENT_IMPORT_TEMPLATES: ContentImportTemplateMeta[] = [
  {
    order: 1,
    key: "subjects",
    titleAr: "المواد الدراسية",
    filename: "01_subjects_template.xlsx",
    descriptionAr: "تعريف المواد (كود، صف، منهج، أيقونة، لون).",
    requiredBaseColumns: ["subject_code", "name", "grade_slug"],
  },
  {
    order: 2,
    key: "units",
    titleAr: "الوحدات",
    filename: "02_units_template.xlsx",
    descriptionAr: "وحدات كل مادة مع الربط بـ subject_code.",
    requiredBaseColumns: ["unit_code", "subject_code", "title"],
  },
  {
    order: 3,
    key: "lessons",
    titleAr: "الدروس",
    filename: "03_lessons_template.xlsx",
    descriptionAr: "قائمة الدروس — lesson_code يُستخدم في القوالب التالية.",
    requiredBaseColumns: ["lesson_code", "subject_code", "title"],
  },
  {
    order: 4,
    key: "book_contents",
    titleAr: "محتوى الكتاب",
    filename: "04_lesson_book_contents_template.xlsx",
    descriptionAr: "نص الدرس الرئيسي (Markdown) وربط PDF اختياري.",
    requiredBaseColumns: ["lesson_code", "content"],
  },
  {
    order: 5,
    key: "explanations",
    titleAr: "الشروحات",
    filename: "05_lesson_explanations_template.xlsx",
    descriptionAr: "شروحات إضافية متعددة لكل درس.",
    requiredBaseColumns: ["lesson_code", "title", "content"],
  },
  {
    order: 6,
    key: "resources",
    titleAr: "الموارد والروابط",
    filename: "06_lesson_resources_template.xlsx",
    descriptionAr: "فيديو، خريطة ذهنية، تجربة، PDF، وروابط خارجية.",
    requiredBaseColumns: ["lesson_code", "resource_type", "title"],
  },
  {
    order: 7,
    key: "assessments",
    titleAr: "تقييمات الدروس",
    filename: "07_lesson_assessments_template.xlsx",
    descriptionAr: "اختبارات قصيرة مرتبطة بدرس (قبل ربط الأسئلة في 08).",
    requiredBaseColumns: ["assessment_code", "lesson_code", "title"],
  },
  {
    order: 8,
    key: "assessment_questions",
    titleAr: "أسئلة التقييمات",
    filename: "08_assessment_questions_template.xlsx",
    descriptionAr: "ربط أسئلة (من 09) باختبار (من 07).",
    requiredBaseColumns: ["assessment_code", "question_code"],
    editorOnly: true,
  },
  {
    order: 9,
    key: "questions",
    titleAr: "بنك الأسئلة",
    filename: "09_questions_template.xlsx",
    descriptionAr: "أسئلة MCQ — أعمدة الإجابة للمحررين فقط.",
    requiredBaseColumns: [
      "question_code",
      "question_text",
      "option_1",
      "option_2",
      "correct_index",
    ],
    editorOnly: true,
  },
];

const INFO_WARNINGS: Record<TemplateKey, readonly string[]> = {
  subjects: [
    "subjects.slug يُشتق تلقائياً من subject_code — لا تضِف عمود slug.",
  ],
  units: [],
  lessons: [
    "lesson_code هو نفسه lessons.slug — فريد داخل المادة الواحدة.",
    "اترك unit_code فارغاً إذا كان الدرس مرتبطاً بالمادة مباشرة.",
  ],
  book_contents: [
    "subject_code + lesson_code معاً يحددان الدرس بدقة.",
    "صف واحد فقط لكل درس.",
  ],
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
  assessment_questions: [
    "لا يعمل هذا القالب إلا بعد مراجعة ونشر أسئلة القالب 09.",
  ],
  questions: [
    "correct_index و explanation للمحررين فقط — لا تُعرض للطلاب.",
    "correct_index يبدأ من 1 في Excel.",
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
 * dependency graph in IMPORT_ENTITY_CONTRACTS (01…07 → 09 → review/publish → 08).
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
