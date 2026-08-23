/**
 * Generate official content-prep Excel templates for lesson upload planning.
 * Run: node scripts/generate-content-templates.mjs
 */
import ExcelJS from "exceljs";
import {
  CONTENT_CODE_SCHEME_VERSION,
  TCS1_FORMAT_TABLE,
  TCS1_RULES_AR,
} from "../src/lib/content-codes/tcs1.ts";
import { TCS1_GRADES, TCS1_TRACKS } from "../src/lib/content-codes/tcs1-master-data.ts";
import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "content-import-templates");
mkdirSync(OUT_DIR, { recursive: true });

const EDITOR_ONLY_WARNING =
  "⚠️ تنبيه: أعمدة «رقم الإجابة الصحيحة» و«شرح الإجابة» مخصصة لفريق التحرير فقط ولا تظهر للطلاب مباشرة.";

const COMMON_NOTES = [
  "هذه النماذج لتجهيز المحتوى قبل الاستيراد — لا تستورد بيانات فعلية من هنا تلقائياً.",
  `الأكواد يملكها النظام (${CONTENT_CODE_SCHEME_VERSION}): نزّل القالب الجاهز من «مركز الاستيراد» ولا تكتب كوداً يدوياً.`,
  "راجع ورقة «مرجع الأكواد» داخل الملف قبل التعبئة — لا تستخدم UUID ولا حروفاً عربية في الأكواد.",
  "لا تضع مفاتيح API أو روابط signed أو أسرار في الملفات.",
  "القيم المنطقية: نعم / لا أو TRUE / FALSE.",
  "حالة المراجعة (إن وُجدت): مسودة | معتمد | يحتاج تعديل",
];

const RESOURCE_TYPES_NOTE =
  "resource_type المسموحة: video | mindmap | experiment | pdf | link";

/** @typedef {{ key: string; header: string; required?: boolean; example: string | number; note?: string }} Col */
/** @typedef {{ file: string; sheet: string; title: string; purpose: string; columns: Col[]; exampleRows: (string|number)[][]; notes: string[]; editorOnlyWarning?: string }} Template */

/** @type {Template[]} */
const templates = [
  {
    file: "01_subjects_template.xlsx",
    sheet: "المواد",
    title: "01 — نموذج المواد الدراسية",
    purpose: "تجهيز قائمة المواد قبل الوحدات والدروس.",
    columns: [
      { key: "subject_code", header: "subject_code", required: true, example: "sub-g10-001", note: "كود فريد للمادة يولّده النظام (TCS-2) — لا يتغير ولا يحتوي المسار" },
      { key: "name", header: "name", required: true, example: "اللغة العربية - النحو", note: "اسم المادة كما يظهر للطالب" },
      { key: "group_code", header: "group_code", example: "grp-g10-01", note: "اختياري — لتجميع أقسام مادة واحدة (SUBJECT_AS_BRANCH)" },
      { key: "group_name", header: "group_name", example: "اللغة العربية", note: "اسم المجموعة المعروض — موحّد لكل الأقسام" },
      { key: "grade_slug", header: "grade_slug", required: true, example: "grade-10" },
      { key: "track_codes", header: "track_codes", required: true, example: "sanaa|aden", note: "مسار أو أكثر مفصولة بـ | — المادة المشتركة تُدخل مرة واحدة" },
      { key: "semester", header: "semester", example: 1, note: "1 أو 2" },
      { key: "icon", header: "icon", example: "⚛️" },
      { key: "color", header: "color", example: "#dc2626", note: "HEX" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "editor_notes", header: "editor_notes", example: "راجع مع منسق المادة" },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [
      ["sub-g10-001", "الفيزياء", "", "", "grade-10", "sanaa|aden", 1, "⚛️", "#dc2626", 9, "", "مسودة"],
      ["sub-g10-002", "اللغة العربية - النحو", "grp-g10-01", "اللغة العربية", "grade-10", "aden", 1, "BookOpen", "#27ae60", 2, "", "مسودة"],
      ["sub-g10-003", "اللغة العربية - البلاغة", "grp-g10-01", "اللغة العربية", "grade-10", "aden", 1, "BookOpen", "#27ae60", 3, "", "مسودة"],
    ],
    notes: [
      ...COMMON_NOTES,
      "ابدأ بتحديد grade_slug ثم track_codes (مسار واحد أو أكثر مفصولة بـ |).",
      "المادة المشتركة بين المناهج تُدخل مرة واحدة فقط: sanaa|aden — لا تكرر الصف لكل مسار.",
      "subject_code يُحدَّد مرة واحدة عند الإنشاء ولا يمكن تغييره لاحقاً.",
      "المادة المتفرعة: كل قسم مادة مستقلة بكود خاص، ويُجمَّعون بنفس group_code و group_name.",
      "group_code يُترك فارغاً للمواد غير المتفرعة، وبعد تعيينه لا يمكن تغييره.",
      "group_name يجب أن يكون موحّداً حرفياً لكل الأقسام التي تحمل نفس group_code.",
      "group_code للعرض فقط — لا يؤثر على الصلاحيات ولا على استهداف الأسئلة.",
    ],
  },
  {
    file: "02_units_template.xlsx",
    sheet: "الوحدات",
    title: "02 — نموذج الوحدات",
    purpose: "تجهيز وحدات كل مادة.",
    columns: [
      { key: "unit_code", header: "unit_code", required: true, example: "unit-g10-001-01" },
      { key: "subject_code", header: "subject_code", required: true, example: "sub-g10-001" },
      { key: "title", header: "title", required: true, example: "الوحدة الأولى: القياس والأخطاء" },
      { key: "description", header: "description", example: "مقدمة في القياس الفيزيائي" },
      { key: "semester", header: "semester", example: 1 },
      { key: "is_free", header: "is_free", example: "لا", note: "نعم / لا" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [["unit-g10-001-01", "sub-g10-001", "الوحدة الأولى: القياس والأخطاء", "مقدمة في القياس", 1, "لا", 1, "مسودة"]],
    notes: [...COMMON_NOTES, "unit_code يجب أن يرتبط بـ subject_code من نموذج 01."],
  },
  {
    file: "03_lessons_template.xlsx",
    sheet: "الدروس",
    title: "03 — نموذج الدروس",
    purpose: "تجهيز قائمة الدروس لكل وحدة.",
    columns: [
      { key: "lesson_code", header: "lesson_code", required: true, example: "lesson-g10-001-001", note: "كود الدرس — فريد" },
      { key: "subject_code", header: "subject_code", required: true, example: "sub-g10-001" },
      { key: "unit_code", header: "unit_code", example: "unit-g10-001-01" },
      { key: "title", header: "title", required: true, example: "الدرس 1: وحدات القياس" },
      { key: "duration", header: "duration", example: "25 دقيقة" },
      { key: "semester", header: "semester", example: 1 },
      { key: "is_free", header: "is_free", example: "لا" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [["lesson-g10-001-001", "sub-g10-001", "unit-g10-001-01", "الدرس 1: وحدات القياس", "25 دقيقة", 1, "لا", 1, "مسودة"]],
    notes: [...COMMON_NOTES, "lesson_code يُستخدم في كل النماذج التالية (04–09)."],
  },
  {
    file: "04_lesson_book_contents_template.xlsx",
    sheet: "محتوى الكتاب",
    title: "04 — نموذج محتوى الكتاب",
    purpose: "نص الدرس الرئيسي (Markdown) وربط PDF اختياري.",
    columns: [
      { key: "subject_code", header: "subject_code", required: true, example: "sub-g10-001", note: "إلزامي — يحدد المادة التي ينتمي إليها lesson_code" },
      { key: "lesson_code", header: "lesson_code", required: true, example: "lesson-g10-001-001" },
      { key: "content", header: "content", required: true, example: "## مقدمة\nوحدات القياس...", note: "Markdown مدعوم" },
      { key: "pdf_url", header: "pdf_url", example: "", note: "رابط PDF عام إن وُجد — اتركه فارغاً إن لم يتوفر" },
      { key: "editor_notes", header: "editor_notes", example: "راجع المصطلحات" },
    ],
    exampleRows: [["sub-g10-001", "lesson-g10-001-001", "## مقدمة\nوحدات القياس هي أساس الفيزياء...", "", ""]],
    notes: [...COMMON_NOTES, "صف واحد لكل درس في محتوى الكتاب."],
  },
  {
    file: "05_lesson_explanations_template.xlsx",
    sheet: "الشروحات",
    title: "05 — نموذج شروحات الدرس",
    purpose: "شروحات إضافية متعددة لكل درس.",
    columns: [
      { key: "subject_code", header: "subject_code", required: true, example: "sub-g10-001", note: "إلزامي — يحدد المادة التي ينتمي إليها lesson_code" },
      { key: "lesson_code", header: "lesson_code", required: true, example: "lesson-g10-001-001" },
      { key: "explanation_code", header: "explanation_code", required: true, example: "exp-g10-001-001-01", note: "هوية ثابتة للشرح — لا تغيّرها بين الدفعات" },
      { key: "title", header: "title", required: true, example: "شرح النظام الدولي للوحدات" },
      { key: "content", header: "content", required: true, example: "النظام الدولي SI يعتمد على..." },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [["sub-g10-001", "lesson-g10-001-001", "exp-g10-001-001-01", "شرح النظام الدولي للوحدات", "النظام الدولي SI...", 1, "مسودة"]],
    notes: [...COMMON_NOTES, "يمكن إضافة أكثر من شرح لنفس lesson_code."],
  },
  {
    file: "06_lesson_resources_template.xlsx",
    sheet: "موارد الدرس",
    title: "06 — نموذج موارد الدرس",
    purpose: "فيديو، خريطة ذهنية، تجربة HTML، PDF، وروابط خارجية.",
    columns: [
      { key: "subject_code", header: "subject_code", required: true, example: "sub-g10-001", note: "إلزامي — يحدد المادة التي ينتمي إليها lesson_code" },
      { key: "lesson_code", header: "lesson_code", required: true, example: "lesson-g10-001-001" },
      { key: "resource_code", header: "resource_code", required: true, example: "res-g10-001-001-01", note: "هوية ثابتة للمورد — لا تغيّرها بين الدفعات" },
      { key: "resource_type", header: "resource_type", required: true, example: "video", note: RESOURCE_TYPES_NOTE },
      { key: "title", header: "title", required: true, example: "شرح وحدات القياس" },
      { key: "description", header: "description", example: "فيديو YouTube تعليمي" },
      { key: "resource_url", header: "resource_url", required: true, example: "https://www.youtube.com/watch?v=example", note: "إلزامي — رابط خارجي أو embed رسمي" },
      { key: "resource_format", header: "resource_format", example: "url", note: "url | html | pdf" },
      { key: "local_asset_path", header: "local_asset_path", example: "assets/lesson-g10-001-001-mindmap.html", note: "مسار نسبي للملف المحلي" },
      { key: "thumbnail_url", header: "thumbnail_url", example: "", note: "اختياري" },
      { key: "is_interactive", header: "is_interactive", example: "نعم", note: "نعم / لا" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "attribution", header: "attribution", example: "PhET Interactive Simulations", note: "إلزامي للموارد الخارجية" },
      { key: "license_note", header: "license_note", example: "CC BY — احتفظ بالنسب", note: "لا تحذف attribution إلا إذا يسمح الترخيص" },
      { key: "notes", header: "notes", example: "رابط خارجي فقط" },
      { key: "is_primary", header: "is_primary", example: "لا", note: "نعم = هذا المورد هو محتوى الدرس نفسه (ملف PDF/Drive) — مورد واحد فقط لكل درس" },
    ],
    exampleRows: [
      ["sub-g10-001", "lesson-g10-001-001", "res-g10-001-001-01", "video", "شرح وحدات القياس", "فيديو YouTube تعليمي", "https://www.youtube.com/watch?v=example", "url", "", "", "لا", 1, "قناة تعليمية — مثال", "YouTube Standard License", "رابط خارجي — تحقق من حقوق النشر", "لا"],
      ["sub-g10-001", "lesson-g10-001-001", "RES-PHYS-G10-U1-L1-02", "mindmap", "خريطة وحدات القياس", "خريطة HTML self-contained", "", "html", "assets/lesson-g10-001-001-mindmap.html", "", "نعم", 2, "أداة Gemini — مثال", "CC BY-SA — احتفظ بالنسب", "ملف HTML محلي — RTL وجوال", "لا"],
      ["sub-g10-001", "lesson-g10-001-001", "RES-PHYS-G10-U1-L1-03", "experiment", "محاكاة الكثافة", "تجربة PhET مع wrapper HTML", "https://phet.colorado.edu/sims/html/density/latest/density_all.html", "html", "assets/lesson-g10-001-001-density.html", "", "نعم", 3, "PhET Interactive Simulations", "PhET CC BY — لا تنسخ المحاكاة", "embed الرابط الرسمي فقط", "لا"],
      ["sub-g10-001", "lesson-g10-001-001", "RES-PHYS-G10-U1-L1-04", "pdf", "ملخص الدرس — PDF", "ملف PDF للطباعة", "", "pdf", "assets/lesson-g10-001-001-summary.pdf", "", "لا", 4, "إنتاج داخلي", "حقوق داخلية", "يُرفع الملف لاحقاً عبر لوحة الإدارة", "لا"],
      ["sub-g10-001", "lesson-g10-001-001", "RES-PHYS-G10-U1-L1-05", "link", "مرجع وزارة التربية", "رابط مرجع رسمي", "https://example.gov.ye/curriculum", "url", "", "", "لا", 5, "وزارة التربية والتعليم", "رابط عام — تحقق من الترخيص", "لا تزِل attribution للموارد المرخّصة", "لا"],
    ],
    notes: [
      ...COMMON_NOTES,
      RESOURCE_TYPES_NOTE,
      "mindmap: ضع ملف HTML في local_asset_path — self-contained، RTL، مناسب للجوال.",
      "experiment: resource_format=html — wrapper ي embed رابط PhET أو محاكاة HTML آمنة.",
      "pdf: local_asset_path يشير لملف PDF المحلي — resource_url يبقى فارغاً عادة.",
      "video: resource_url = رابط YouTube/Vimeo — لا رفع فيديو داخل التطبيق.",
      "is_primary=نعم: الدرس يُسلَّم كملف خارجي — يفتحه الطالب مباشرة من صفحة الدرس (يصلح لدروس PDF على Google Drive).",
      "⚠️ أي مورد خارجي: احترم الترخيص ولا تحذف attribution إلا إذا كان الترخيص يسمح بذلك.",
    ],
  },
  {
    file: "07_lesson_assessments_template.xlsx",
    sheet: "اختبارات الدرس",
    title: "07 — نموذج اختبارات/تقييمات الدرس",
    purpose: "اختبارات قصيرة مرتبطة بدرس واحد (قبل ربط الأسئلة في 08).",
    columns: [
      { key: "assessment_code", header: "assessment_code", required: true, example: "asm-g10-001-001-01" },
      { key: "subject_code", header: "subject_code", required: true, example: "sub-g10-001", note: "إلزامي — يحدد المادة التي ينتمي إليها lesson_code" },
      { key: "lesson_code", header: "lesson_code", required: true, example: "lesson-g10-001-001" },
      { key: "title", header: "title", required: true, example: "اختبار قصير — وحدات القياس" },
      { key: "instructions", header: "instructions", example: "أجب عن جميع الأسئلة خلال 10 دقائق" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [["asm-g10-001-001-01", "sub-g10-001", "lesson-g10-001-001", "اختبار قصير — وحدات القياس", "أجب خلال 10 دقائق", 1, "مسودة"]],
    notes: [...COMMON_NOTES, "اربط الأسئلة في نموذج 08_assessment_questions_template."],
  },
  {
    file: "08_assessment_questions_template.xlsx",
    sheet: "أسئلة الاختبار",
    title: "08 — نموذج ربط أسئلة الاختبار",
    purpose: "ربط أسئلة (من نموذج 09) باختبار درس (من نموذج 07).",
    editorOnlyWarning: EDITOR_ONLY_WARNING,
    columns: [
      { key: "assessment_code", header: "assessment_code", required: true, example: "asm-g10-001-001-01" },
      { key: "question_code", header: "question_code", required: true, example: "q-g10-001-00001" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "points", header: "points", example: 1 },
      { key: "editor_notes", header: "editor_notes", example: "" },
    ],
    exampleRows: [["asm-g10-001-001-01", "q-g10-001-00001", 1, 1, ""]],
    notes: [...COMMON_NOTES, "question_code يجب أن يطابق نموذج 09.", EDITOR_ONLY_WARNING],
  },
  {
    file: "09_official_book_questions_template.xlsx",
    sheet: "أسئلة الكتاب الأصلية",
    title: "09 — نموذج أسئلة الكتاب الأصلية",
    purpose: "استخراج أسئلة الدرس بصيغتها الأصلية في الكتاب، مهما كان نوع السؤال.",
    editorOnlyWarning: EDITOR_ONLY_WARNING,
    columns: [
      { key: "question_code", header: "question_code", required: true, example: "q-g10-001-00001" },
      { key: "subject_code", header: "subject_code", required: true, example: "sub-g10-001" },
      { key: "lesson_code", header: "lesson_code", required: true, example: "lesson-g10-001-001" },
      { key: "prompt_kind", header: "prompt_kind", required: true, example: "تعليل", note: "تعريف | تعليل | سؤال_قصير | شرح | اختيار_واحد | أخرى" },
      { key: "question_text", header: "question_text", required: true, example: "علل: تعد وحدات القياس ضرورية في الفيزياء.", note: "النص الأصلي كما ورد في الكتاب دون إعادة صياغة" },
      { key: "interaction_type", header: "interaction_type", required: true, example: "LONG_TEXT", note: "LONG_TEXT | SHORT_TEXT | SINGLE_CHOICE" },
      { key: "grading_mode", header: "grading_mode", required: true, example: "MANUAL", note: "MANUAL | AUTO_TEXT | AUTO_SINGLE" },
      { key: "option_1", header: "option_1", example: "" },
      { key: "option_2", header: "option_2", example: "" },
      { key: "option_3", header: "option_3", example: "" },
      { key: "option_4", header: "option_4", example: "" },
      { key: "option_5", header: "option_5", example: "" },
      { key: "option_6", header: "option_6", example: "" },
      { key: "correct_index", header: "correct_index", example: "", note: "مطلوب فقط إذا كان النوع SINGLE_CHOICE" },
      { key: "accepted_answers", header: "accepted_answers", example: "", note: "مطلوب فقط إذا كان النوع SHORT_TEXT؛ افصل القيم بـ |" },
      { key: "model_answer", header: "model_answer", required: true, example: "لأنها توحّد التعبير الكمي وتسمح بالمقارنة الدقيقة.", note: "تظهر بعد محاولة الطالب" },
      { key: "explanation", header: "explanation", example: "الإجابة تربط القياس بالدقة وإمكانية المقارنة." },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [
      ["q-g10-001-00001", "sub-g10-001", "lesson-g10-001-001", "تعليل", "علل: تعد وحدات القياس ضرورية في الفيزياء.", "LONG_TEXT", "MANUAL", "", "", "", "", "", "", "", "", "لأنها توحّد التعبير الكمي وتسمح بالمقارنة الدقيقة.", "", 1, "مسودة"],
    ],
    notes: [
      ...COMMON_NOTES,
      EDITOR_ONLY_WARNING,
      "الدور OFFICIAL_BOOK_QUESTION يثبته النظام من اسم القالب ولا يكتبه المحرر.",
      "وجود خيارات في سؤال كتاب أصلي لا ينقله إلى «اختبر فهمك».",
      "model_answer إلزامي للأسئلة المقالية أو ذات التصحيح اليدوي، ويظهر فقط بعد محاولة الطالب.",
      "إذا كان interaction_type اختيارًا من متعدد فاملأ الخيارات وcorrect_index، ويُشتق model_answer من الخيار الصحيح إذا تُرك فارغًا.",
    ],
  },
  {
    file: "10_self_test_questions_template.xlsx",
    sheet: "اختبر فهمك",
    title: "10 — نموذج اختبر فهمك",
    purpose: "بنك مستقل من أسئلة الاختيار من متعدد مع الشرح وتصويب الإجابات الخاطئة.",
    editorOnlyWarning: EDITOR_ONLY_WARNING,
    columns: [
      { key: "question_code", header: "question_code", required: true, example: "st-g10-001-00001" },
      { key: "subject_code", header: "subject_code", required: true, example: "sub-g10-001" },
      { key: "lesson_code", header: "lesson_code", required: true, example: "lesson-g10-001-001" },
      { key: "question_text", header: "question_text", required: true, example: "ما وحدة قياس القوة في النظام الدولي؟" },
      { key: "option_1", header: "option_1", required: true, example: "نيوتن" },
      { key: "option_2", header: "option_2", required: true, example: "جول" },
      { key: "option_3", header: "option_3", example: "واط" },
      { key: "option_4", header: "option_4", example: "باسكال" },
      { key: "option_5", header: "option_5", example: "" },
      { key: "option_6", header: "option_6", example: "" },
      { key: "correct_index", header: "correct_index", required: true, example: 1, note: "1=option_1 … 6=option_6 — للمحررين فقط" },
      { key: "explanation", header: "explanation", required: true, example: "النيوتن هو وحدة القوة في النظام الدولي." },
      { key: "why_wrong_1", header: "why_wrong_1", example: "" },
      { key: "why_wrong_2", header: "why_wrong_2", example: "الجول وحدة طاقة وليس قوة." },
      { key: "why_wrong_3", header: "why_wrong_3", example: "الواط وحدة قدرة وليس قوة." },
      { key: "why_wrong_4", header: "why_wrong_4", example: "الباسكال وحدة ضغط وليس قوة." },
      { key: "why_wrong_5", header: "why_wrong_5", example: "" },
      { key: "why_wrong_6", header: "why_wrong_6", example: "" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [
      ["st-g10-001-00001", "sub-g10-001", "lesson-g10-001-001", "ما وحدة قياس القوة في النظام الدولي؟", "نيوتن", "جول", "واط", "باسكال", "", "", 1, "النيوتن هو وحدة القوة في النظام الدولي.", "", "الجول وحدة طاقة وليس قوة.", "الواط وحدة قدرة وليس قوة.", "الباسكال وحدة ضغط وليس قوة.", "", "", 1, "مسودة"],
    ],
    notes: [
      ...COMMON_NOTES,
      EDITOR_ONLY_WARNING,
      "الدور SELF_TEST ونوع SINGLE_CHOICE يثبتهما النظام من اسم القالب.",
      "explanation إلزامي ويظهر بعد اختيار الطالب.",
      "عدد الخيارات من 2 إلى 6؛ correct_index يجب أن يكون ضمن عدد الخيارات المدخلة فعليًا.",
      "why_wrong_1…6 اختيارية لتصويب كل إجابة خاطئة بصورة أدق.",
    ],
  },
];

const GENERATED_FILES = new Set(templates.map((t) => t.file));

function fillDataSheet(ws, columns, exampleRows) {
  ws.views = [{ rightToLeft: true }];
  ws.columns = columns.map((c) => ({
    header: c.required ? `${c.header} *` : c.header,
    key: c.key,
    width: Math.max(18, String(c.header).length + 8),
  }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 28;
  for (const row of exampleRows) ws.addRow(row);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

function fillInstructionsSheet(ws, t) {
  ws.views = [{ rightToLeft: true }];
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 80;
  ws.addRow([t.title]).font = { bold: true, size: 14 };
  ws.addRow(["الغرض", t.purpose]);
  ws.addRow(["اسم الملف", t.file]);
  ws.addRow([]);
  if (t.editorOnlyWarning) {
    const warn = ws.addRow(["⚠️ تنبيه للمحررين", t.editorOnlyWarning]);
    warn.getCell(2).font = { bold: true, color: { argb: "FFB45309" } };
    ws.addRow([]);
  }
  ws.addRow(["— الأعمدة —"]).font = { bold: true };
  for (const c of t.columns) {
    ws.addRow([
      c.header + (c.required ? " *" : ""),
      [c.note ? `ملاحظة: ${c.note}` : "", `مثال: ${c.example}`].filter(Boolean).join(" — "),
    ]);
  }
  ws.addRow([]);
  ws.addRow(["— تعليمات عامة —"]).font = { bold: true };
  for (const n of t.notes) ws.addRow(["•", n]);
}

/** OFFICIAL_CONTENT_CODE_SYSTEM_13B — shared code reference sheet. */
function fillCodeReferenceSheet(ws) {
  ws.views = [{ rightToLeft: true }];
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 52;
  ws.getColumn(3).width = 60;
  ws.addRow([`مرجع الأكواد الرسمي — ${CONTENT_CODE_SCHEME_VERSION}`]).font = { bold: true, size: 14 };
  ws.addRow([]);
  ws.addRow(["— صيغ الأكواد —"]).font = { bold: true };
  for (const row of TCS1_FORMAT_TABLE) ws.addRow([row.labelAr, row.format, `مثال: ${row.example}`]);
  ws.addRow([]);
  ws.addRow(["— القواعد —"]).font = { bold: true };
  for (const rule of TCS1_RULES_AR) ws.addRow(["•", rule]);
  ws.addRow([]);
  ws.addRow(["— الصفوف المعتمدة —"]).font = { bold: true };
  for (const g of TCS1_GRADES) ws.addRow([g.gradeShort, g.gradeSlug, g.nameAr]);
  ws.addRow([]);
  ws.addRow(["— المسارات المعتمدة —"]).font = { bold: true };
  for (const t of TCS1_TRACKS) ws.addRow([t.trackCode, t.trackCode, t.nameAr]);
}

async function generate(t) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Content Upload Templates — Tanoir";
  wb.created = new Date("2026-07-03T00:00:00.000Z");
  fillInstructionsSheet(wb.addWorksheet("تعليمات"), t);
  fillCodeReferenceSheet(wb.addWorksheet("مرجع الأكواد"));
  fillDataSheet(wb.addWorksheet(t.sheet), t.columns, t.exampleRows);
  await wb.xlsx.writeFile(join(OUT_DIR, t.file));
  console.log("✓", t.file);
}

function cleanupLegacyTemplates() {
  const keep = new Set([...GENERATED_FILES, "README.md"]);
  for (const name of readdirSync(OUT_DIR)) {
    if (name.endsWith(".xlsx") && !GENERATED_FILES.has(name)) {
      unlinkSync(join(OUT_DIR, name));
      console.log("✗ removed legacy", name);
    }
  }
}

for (const t of templates) await generate(t);
cleanupLegacyTemplates();
console.log(`\nGenerated ${templates.length} templates in ${OUT_DIR}`);
