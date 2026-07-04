/** Static metadata for lesson content Excel templates (01–09). No file I/O. */

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

export const CONTENT_IMPORT_TEMPLATE_KEYS = [
  "subjects",
  "units",
  "lessons",
  "book_contents",
  "explanations",
  "resources",
  "assessments",
  "assessment_questions",
  "questions",
] as const;

export type ContentImportTemplateKey =
  (typeof CONTENT_IMPORT_TEMPLATE_KEYS)[number];

export interface ContentImportDryRunConfig {
  requiredColumns: readonly string[];
  knownColumns: readonly string[];
  duplicateKeyColumn?: string;
  compositeDuplicateKeys?: readonly string[];
  infoWarnings: readonly string[];
}

export const CONTENT_IMPORT_TEMPLATE_BASE_PATH = "/content-import-templates";

export const CONTENT_IMPORT_WORKFLOW_ORDER =
  "01 → 02 → 03 → 04 → 05 → 06 → 09 → 07 → 08" as const;

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

const DRY_RUN_CONFIG: Record<ContentImportTemplateKey, ContentImportDryRunConfig> = {
  subjects: {
    requiredColumns: ["subject_code", "name", "grade_slug"],
    knownColumns: [
      "subject_code",
      "name",
      "grade_slug",
      "track_code",
      "semester",
      "icon",
      "color",
      "sort_order",
      "editor_notes",
      "review_status",
    ],
    duplicateKeyColumn: "subject_code",
    infoWarnings: [],
  },
  units: {
    requiredColumns: ["unit_code", "subject_code", "title"],
    knownColumns: [
      "unit_code",
      "subject_code",
      "title",
      "description",
      "semester",
      "is_free",
      "sort_order",
      "review_status",
    ],
    duplicateKeyColumn: "unit_code",
    infoWarnings: [],
  },
  lessons: {
    requiredColumns: ["lesson_code", "subject_code", "title"],
    knownColumns: [
      "lesson_code",
      "subject_code",
      "unit_code",
      "title",
      "duration",
      "semester",
      "is_free",
      "sort_order",
      "review_status",
    ],
    duplicateKeyColumn: "lesson_code",
    infoWarnings: [
      "lesson_code سيتم ربطه لاحقاً بـ lessons.slug في مرحلة التنفيذ الفعلي.",
    ],
  },
  book_contents: {
    requiredColumns: ["lesson_code", "content"],
    knownColumns: ["lesson_code", "content", "pdf_url", "editor_notes"],
    duplicateKeyColumn: "lesson_code",
    infoWarnings: [
      "lesson_code سيتم ربطه لاحقاً بـ lessons.slug في مرحلة التنفيذ الفعلي.",
    ],
  },
  explanations: {
    requiredColumns: ["lesson_code", "title", "content"],
    knownColumns: ["lesson_code", "title", "content", "sort_order", "review_status"],
    infoWarnings: [
      "lesson_code سيتم ربطه لاحقاً بـ lessons.slug في مرحلة التنفيذ الفعلي.",
    ],
  },
  resources: {
    requiredColumns: ["lesson_code", "resource_type", "title"],
    knownColumns: [
      "lesson_code",
      "resource_type",
      "title",
      "description",
      "resource_url",
      "resource_format",
      "local_asset_path",
      "thumbnail_url",
      "is_interactive",
      "sort_order",
      "attribution",
      "license_note",
      "notes",
    ],
    infoWarnings: [
      "lesson_code سيتم ربطه لاحقاً بـ lessons.slug في مرحلة التنفيذ الفعلي.",
      "resource_type المسموح: video | mindmap | experiment | pdf | link.",
    ],
  },
  assessments: {
    requiredColumns: ["assessment_code", "lesson_code", "title"],
    knownColumns: [
      "assessment_code",
      "lesson_code",
      "title",
      "instructions",
      "sort_order",
      "review_status",
    ],
    duplicateKeyColumn: "assessment_code",
    infoWarnings: [
      "lesson_code سيتم ربطه لاحقاً بـ lessons.slug في مرحلة التنفيذ الفعلي.",
      "قد يُضاف عمود assessment_code في قاعدة البيانات لاحقاً قبل التنفيذ الفعلي — لا migration في هذه المرحلة.",
    ],
  },
  assessment_questions: {
    requiredColumns: ["assessment_code", "question_code"],
    knownColumns: [
      "assessment_code",
      "question_code",
      "sort_order",
      "points",
      "editor_notes",
    ],
    compositeDuplicateKeys: ["assessment_code", "question_code"],
    infoWarnings: [
      "assessment_code و question_code يحتاجان mapping في مرحلة التنفيذ الفعلي.",
      "قد يُضاف عمود assessment_code في قاعدة البيانات لاحقاً — لا migration في هذه المرحلة.",
    ],
  },
  questions: {
    requiredColumns: [
      "question_code",
      "question_text",
      "option_1",
      "option_2",
      "correct_index",
    ],
    knownColumns: [
      "question_code",
      "lesson_code",
      "subject_code",
      "question_text",
      "option_1",
      "option_2",
      "option_3",
      "option_4",
      "option_5",
      "option_6",
      "correct_index",
      "explanation",
      "review_status",
    ],
    duplicateKeyColumn: "question_code",
    infoWarnings: [
      "lesson_code (إن وُجد) سيتم ربطه لاحقاً بـ lessons.slug في مرحلة التنفيذ الفعلي.",
      "correct_index و explanation للمحررين فقط — لا تُعرض للطلاب.",
    ],
  },
};

const CONTENT_IMPORT_UI_ORDER = [1, 2, 3, 4, 5, 6, 9, 7, 8] as const;

/** Workflow display order (09 before 07–08). */
export const CONTENT_IMPORT_TEMPLATES_DISPLAY_ORDER: ContentImportTemplateMeta[] =
  CONTENT_IMPORT_UI_ORDER.map((order) => {
    const template = CONTENT_IMPORT_TEMPLATES.find((t) => t.order === order);
    if (!template) {
      throw new Error(`Missing content import template for order ${order}`);
    }
    return template;
  });

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
