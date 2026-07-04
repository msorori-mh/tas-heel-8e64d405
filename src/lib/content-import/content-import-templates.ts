/** Static metadata for lesson content Excel templates (01–09). No file I/O. */

export interface ContentImportTemplateMeta {
  order: number;
  key: string;
  titleAr: string;
  filename: string;
  descriptionAr: string;
  /** Required columns shown in UI — display only, not validation. */
  requiredBaseColumns: readonly string[];
  editorOnly?: boolean;
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
    requiredBaseColumns: ["question_code", "question_text", "option_1", "option_2", "correct_index"],
    editorOnly: true,
  },
];

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
