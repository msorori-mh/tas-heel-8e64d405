/**
 * Generate content-prep Excel templates (ESM, run with node).
 * node scripts/generate-content-templates.mjs
 */
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "content-templates");
mkdirSync(OUT_DIR, { recursive: true });

const EDITOR_ONLY_WARNING =
  "⚠️ تنبيه: أعمدة «رقم الإجابة الصحيحة» و«شرح الإجابة» مخصصة لفريق التحرير فقط ولا تظهر للطلاب مباشرة.";

const COMMON_NOTES = [
  "هذه النماذج لتجهيز المحتوى فقط — غير مربوطة بنظام الاستيراد الرسمي حالياً.",
  "استخدم أكواداً نصية ثابتة (snake_case أو kebab-case) — لا تستخدم UUID.",
  "لا تضع مفاتيح API أو روابط خاصة أو أسرار في الملفات.",
  "القيم المنطقية: نعم / لا أو TRUE / FALSE.",
  "حالة المراجعة: مسودة | معتمد | يحتاج تعديل",
];

/** @typedef {{ key: string; header: string; required?: boolean; example: string | number; note?: string }} Col */
/** @typedef {{ file: string; sheet: string; title: string; purpose: string; columns: Col[]; exampleRow: (string|number)[]; notes: string[]; extraSheets?: { name: string; columns: Col[]; exampleRow: (string|number)[] }[]; editorOnlyWarning?: string }} Template */

/** @type {Template[]} */
const templates = [
  {
    file: "subjects_template.xlsx",
    sheet: "المواد",
    title: "نموذج تجهيز المواد الدراسية",
    purpose: "تجهيز قائمة المواد قبل أي استيراد رسمي.",
    columns: [
      { key: "subject_code", header: "كود المادة", required: true, example: "phys-g10-aden", note: "فريد — مثال: phys-g10-aden" },
      { key: "name", header: "اسم المادة", required: true, example: "الفيزياء" },
      { key: "grade_slug", header: "كود الصف", required: true, example: "grade-10", note: "مثل grade-10" },
      { key: "track_code", header: "كود المنهج", example: "aden", note: "sanaa | aden | ..." },
      { key: "semester", header: "الفصل الدراسي", example: 1, note: "1 أو 2" },
      { key: "icon", header: "أيقونة", example: "⚛️" },
      { key: "color", header: "لون العرض", example: "#dc2626", note: "HEX" },
      { key: "sort_order", header: "ترتيب العرض", example: 1 },
      { key: "editor_notes", header: "ملاحظات للمحرر", example: "راجع مع منسق المادة" },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: ["phys-g10-aden", "الفيزياء", "grade-10", "aden", 1, "⚛️", "#dc2626", 1, "", "مسودة"],
    notes: [...COMMON_NOTES, "ابدأ بتحديد كود الصف وكود المنهج قبل تعبئة المواد."],
  },
  {
    file: "units_template.xlsx",
    sheet: "الوحدات",
    title: "نموذج تجهيز الوحدات",
    purpose: "تجهيز وحدات كل مادة.",
    columns: [
      { key: "unit_code", header: "كود الوحدة", required: true, example: "phys-g10-aden-u01" },
      { key: "subject_code", header: "كود المادة", required: true, example: "phys-g10-aden" },
      { key: "title", header: "عنوان الوحدة", required: true, example: "الوحدة الأولى: القياس والأخطاء" },
      { key: "description", header: "وصف مختصر", example: "مقدمة في القياس الفيزيائي" },
      { key: "semester", header: "الفصل الدراسي", example: 1 },
      { key: "is_free", header: "مجاني؟", example: "لا", note: "نعم / لا" },
      { key: "sort_order", header: "ترتيب العرض", example: 1 },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: ["phys-g10-aden-u01", "phys-g10-aden", "الوحدة الأولى: القياس والأخطاء", "مقدمة في القياس", 1, "لا", 1, "مسودة"],
    notes: [...COMMON_NOTES, "كود الوحدة يجب أن يرتبط بكود مادة موجود في نموذج المواد."],
  },
  {
    file: "lessons_template.xlsx",
    sheet: "الدروس",
    title: "نموذج تجهيز الدروس",
    purpose: "تجهيز قائمة الدروس لكل وحدة.",
    columns: [
      { key: "lesson_slug", header: "كود الدرس", required: true, example: "phys-g10-u1-l1", note: "فريد عالمياً" },
      { key: "subject_code", header: "كود المادة", required: true, example: "phys-g10-aden" },
      { key: "unit_code", header: "كود الوحدة", example: "phys-g10-aden-u01" },
      { key: "title", header: "عنوان الدرس", required: true, example: "الدرس 1: وحدات القياس" },
      { key: "duration", header: "المدة التقديرية", example: "25 دقيقة" },
      { key: "semester", header: "الفصل الدراسي", example: 1 },
      { key: "is_free", header: "مجاني؟", example: "لا" },
      { key: "sort_order", header: "ترتيب العرض", example: 1 },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: ["phys-g10-u1-l1", "phys-g10-aden", "phys-g10-aden-u01", "الدرس 1: وحدات القياس", "25 دقيقة", 1, "لا", 1, "مسودة"],
    notes: [...COMMON_NOTES, "الفيديو والـ PDF يُجهّزان في نماذج منفصلة (فيديو خارجي / PDF)."],
  },
  {
    file: "lesson_content_template.xlsx",
    sheet: "محتوى الكتاب",
    title: "نموذج محتوى الدرس",
    purpose: "تجهيز نصوص الدرس: كتاب، ملخص، شروحات.",
    columns: [
      { key: "lesson_slug", header: "كود الدرس", required: true, example: "phys-g10-u1-l1" },
      { key: "content", header: "نص المحتوى", example: "نص الدرس (Markdown مدعوم)", note: "الفقرات والعناوين" },
      { key: "editor_notes", header: "ملاحظات للمحرر", example: "راجع المصطلحات" },
    ],
    exampleRow: ["phys-g10-u1-l1", "## مقدمة\nوحدات القياس هي...", ""],
    extraSheets: [
      {
        name: "الملخص",
        columns: [
          { key: "lesson_slug", header: "كود الدرس", required: true, example: "phys-g10-u1-l1" },
          { key: "summary", header: "ملخص الدرس", required: true, example: "ملخص قصير للدرس" },
          { key: "key_points", header: "النقاط الرئيسية", example: "نقطة 1|نقطة 2|نقطة 3", note: "افصل بـ |" },
          { key: "study_tip", header: "نصيحة دراسية", example: "ركز على تحويل الوحدات" },
        ],
        exampleRow: ["phys-g10-u1-l1", "ملخص عن وحدات القياس", "SI|تحويل|دقة", "حل تمارين التحويل"],
      },
      {
        name: "الشروحات",
        columns: [
          { key: "lesson_slug", header: "كود الدرس", required: true, example: "phys-g10-u1-l1" },
          { key: "title", header: "عنوان الشرح", required: true, example: "شرح النظام الدولي للوحدات" },
          { key: "content", header: "نص الشرح", required: true, example: "النظام الدولي SI يعتمد على..." },
          { key: "sort_order", header: "ترتيب العرض", example: 1 },
        ],
        exampleRow: ["phys-g10-u1-l1", "شرح النظام الدولي للوحدات", "النظام الدولي SI...", 1],
      },
    ],
    notes: [...COMMON_NOTES, "كل شيت مستقل — اربط كل صف بكود الدرس الصحيح."],
  },
  {
    file: "lesson_resources_template.xlsx",
    sheet: "موارد الدرس",
    title: "نموذج موارد الدرس العامة",
    purpose: "قائمة موارد مرتبطة بالدرس (روابط، مراجع، ملاحظات).",
    columns: [
      { key: "lesson_slug", header: "كود الدرس", required: true, example: "phys-g10-u1-l1" },
      { key: "resource_type", header: "نوع المورد", required: true, example: "link", note: "link | pdf | video | mindmap | experiment" },
      { key: "title", header: "عنوان المورد", required: true, example: "مرجع وزارة التربية" },
      { key: "url_or_ref", header: "رابط أو مرجع", example: "https://example.com/ref", note: "رابط عام فقط" },
      { key: "description", header: "وصف", example: "مرجع رسمي للوحدة" },
      { key: "sort_order", header: "ترتيب العرض", example: 1 },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: ["phys-g10-u1-l1", "link", "مرجع وزارة التربية", "https://example.com/ref", "مرجع رسمي", 1, "مسودة"],
    notes: [...COMMON_NOTES, "للخرائط الذهنية HTML استخدم نموذج lesson_mind_map_html_template.", "للتجارب PhET استخدم lesson_lab_simulation_html_template."],
  },
  {
    file: "lesson_quiz_questions_template.xlsx",
    sheet: "أسئلة الدرس",
    title: "نموذج أسئلة اختبار الدرس",
    purpose: "أسئلة MCQ مرتبطة بدرس واحد (اختبار قصير بعد الدرس).",
    editorOnlyWarning: EDITOR_ONLY_WARNING,
    columns: [
      { key: "question_code", header: "كود السؤال", example: "Q-PHYS-G10-U1-L1-001" },
      { key: "lesson_slug", header: "كود الدرس", required: true, example: "phys-g10-u1-l1" },
      { key: "question_text", header: "نص السؤال", required: true, example: "ما وحدة قياس القوة في SI؟" },
      { key: "option_1", header: "الخيار 1", required: true, example: "نيوتن" },
      { key: "option_2", header: "الخيار 2", required: true, example: "جول" },
      { key: "option_3", header: "الخيار 3", example: "واط" },
      { key: "option_4", header: "الخيار 4", example: "باسكال" },
      { key: "option_5", header: "الخيار 5", example: "" },
      { key: "option_6", header: "الخيار 6", example: "" },
      { key: "correct_index", header: "رقم الإجابة الصحيحة (تحرير)", required: true, example: 1, note: "1=الخيار1 ... 6=الخيار6 — للمحررين فقط" },
      { key: "explanation", header: "شرح الإجابة (تحرير)", example: "القوة تُقاس بالنيوتن", note: "للمحررين فقط" },
      { key: "sort_order", header: "ترتيب العرض", example: 1 },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: ["Q-PHYS-G10-U1-L1-001", "phys-g10-u1-l1", "ما وحدة قياس القوة في SI؟", "نيوتن", "جول", "واط", "باسكال", "", "", 1, "القوة تُقاس بالنيوتن", 1, "مسودة"],
    notes: [...COMMON_NOTES, EDITOR_ONLY_WARNING, "اجعل أعمدة الخيارات بصيغة Text في Excel."],
  },
  {
    file: "question_bank_template.xlsx",
    sheet: "بنك الأسئلة",
    title: "نموذج بنك الأسئلة",
    purpose: "أسئلة عامة على مستوى المادة أو الدرس (بنك مركزي).",
    editorOnlyWarning: EDITOR_ONLY_WARNING,
    columns: [
      { key: "question_code", header: "كود السؤال", example: "Q-PHYS-G10-001" },
      { key: "subject_code", header: "كود المادة", required: true, example: "phys-g10-aden" },
      { key: "lesson_slug", header: "كود الدرس (اختياري)", example: "phys-g10-u1-l1" },
      { key: "question_text", header: "نص السؤال", required: true, example: "أي مما يلي كمية قياسية؟" },
      { key: "option_1", header: "الخيار 1", required: true, example: "السرعة" },
      { key: "option_2", header: "الخيار 2", required: true, example: "الكتلة" },
      { key: "option_3", header: "الخيار 3", example: "السرعة المتجهة" },
      { key: "option_4", header: "الخيار 4", example: "التسارع" },
      { key: "option_5", header: "الخيار 5", example: "" },
      { key: "option_6", header: "الخيار 6", example: "" },
      { key: "correct_index", header: "رقم الإجابة الصحيحة (تحرير)", required: true, example: 2, note: "للمحررين فقط" },
      { key: "explanation", header: "شرح الإجابة (تحرير)", example: "الكتلة كمية قياسية أساسية", note: "للمحررين فقط" },
      { key: "year", header: "سنة المرجع", example: 2024 },
      { key: "semester", header: "الفصل", example: 1 },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: ["Q-PHYS-G10-001", "phys-g10-aden", "phys-g10-u1-l1", "أي مما يلي كمية قياسية؟", "السرعة", "الكتلة", "السرعة المتجهة", "التسارع", "", "", 2, "الكتلة كمية قياسية", 2024, 1, "مسودة"],
    notes: [...COMMON_NOTES, EDITOR_ONLY_WARNING],
  },
  {
    file: "subject_exam_questions_template.xlsx",
    sheet: "نماذج الاختبار",
    title: "نموذج أسئلة اختبار المادة",
    purpose: "تجهيز اختبارات Training/Strict وربطها بأسئلة البنك.",
    editorOnlyWarning: EDITOR_ONLY_WARNING,
    columns: [
      { key: "template_code", header: "كود الاختبار", required: true, example: "EXAM-PHYS-G10-U1" },
      { key: "title", header: "عنوان الاختبار", required: true, example: "اختبار الوحدة الأولى" },
      { key: "mode", header: "نوع الاختبار", required: true, example: "training", note: "training | strict | ministry" },
      { key: "subject_code", header: "كود المادة", example: "phys-g10-aden" },
      { key: "unit_code", header: "كود الوحدة", example: "phys-g10-aden-u01" },
      { key: "lesson_slug", header: "كود الدرس (اختياري)", example: "" },
      { key: "duration_minutes", header: "المدة (دقيقة)", example: 30 },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: ["EXAM-PHYS-G10-U1", "اختبار الوحدة الأولى", "training", "phys-g10-aden", "phys-g10-aden-u01", "", 30, "مسودة"],
    extraSheets: [
      {
        name: "أسئلة الاختبار",
        columns: [
          { key: "template_code", header: "كود الاختبار", required: true, example: "EXAM-PHYS-G10-U1" },
          { key: "question_code", header: "كود السؤال", required: true, example: "Q-PHYS-G10-001" },
          { key: "sort_order", header: "ترتيب السؤال", example: 1 },
          { key: "points", header: "الدرجة", example: 1 },
          { key: "editor_notes", header: "ملاحظات المحرر", example: "" },
        ],
        exampleRow: ["EXAM-PHYS-G10-U1", "Q-PHYS-G10-001", 1, 1, ""],
      },
    ],
    notes: [...COMMON_NOTES, "أكواد الأسئلة يجب أن تطابق بنك الأسئلة.", EDITOR_ONLY_WARNING],
  },
  {
    file: "quick_review_template.xlsx",
    sheet: "مراجعة سريعة",
    title: "نموذج المراجعة السريعة",
    purpose: "بطاقات مراجعة سريعة قبل الاختبار.",
    columns: [
      { key: "review_code", header: "كود المراجعة", required: true, example: "QR-PHYS-G10-U1" },
      { key: "subject_code", header: "كود المادة", required: true, example: "phys-g10-aden" },
      { key: "unit_code", header: "كود الوحدة", example: "phys-g10-aden-u01" },
      { key: "lesson_slug", header: "كود الدرس (اختياري)", example: "phys-g10-u1-l1" },
      { key: "title", header: "عنوان المراجعة", required: true, example: "مراجعة وحدات القياس" },
      { key: "quick_points", header: "نقاط سريعة", required: true, example: "SI|تحويل|دقة|أخطاء", note: "افصل بـ |" },
      { key: "reading_minutes", header: "مدة القراءة (دقيقة)", example: 5 },
      { key: "sort_order", header: "ترتيب العرض", example: 1 },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: ["QR-PHYS-G10-U1", "phys-g10-aden", "phys-g10-aden-u01", "phys-g10-u1-l1", "مراجعة وحدات القياس", "SI|تحويل|دقة", 5, 1, "مسودة"],
    notes: [...COMMON_NOTES],
  },
  {
    file: "external_videos_template.xlsx",
    sheet: "فيديوهات خارجية",
    title: "نموذج الفيديوهات الخارجية",
    purpose: "روابط فيديو YouTube أو منصات خارجية — لا رفع فيديو داخلياً.",
    columns: [
      { key: "lesson_slug", header: "كود الدرس", required: true, example: "phys-g10-u1-l1" },
      { key: "video_title", header: "عنوان الفيديو", required: true, example: "شرح وحدات القياس" },
      { key: "platform", header: "المنصة", example: "YouTube", note: "YouTube | Vimeo | ..." },
      { key: "external_url", header: "الرابط الخارجي", required: true, example: "https://www.youtube.com/watch?v=example" },
      { key: "duration", header: "مدة الفيديو", example: "12:30" },
      { key: "description", header: "وصف", example: "شرح مبسط للوحدات" },
      { key: "sort_order", header: "ترتيب العرض", example: 1 },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: ["phys-g10-u1-l1", "شرح وحدات القياس", "YouTube", "https://www.youtube.com/watch?v=example", "12:30", "شرح مبسط", 1, "مسودة"],
    notes: [...COMMON_NOTES, "الفيديو روابط خارجية فقط — لا رفع ملف فيديو داخل التطبيق.", "تحقق من حقوق النشر قبل الاعتماد."],
  },
  {
    file: "pdf_resources_template.xlsx",
    sheet: "ملفات PDF",
    title: "نموذج ملفات PDF",
    purpose: "تجهيز قائمة ملفات PDF المرتبطة بالدروس (أسماء ملفات — الرفع لاحقاً).",
    columns: [
      { key: "lesson_slug", header: "كود الدرس", required: true, example: "phys-g10-u1-l1" },
      { key: "pdf_title", header: "عنوان الملف", required: true, example: "ملخص الدرس — PDF" },
      { key: "suggested_filename", header: "اسم الملف المقترح", required: true, example: "phys-g10-u1-l1-summary.pdf", note: "بدون مسافات" },
      { key: "pdf_type", header: "نوع الملف", example: "summary", note: "summary | exercises | reference" },
      { key: "description", header: "وصف", example: "ملخص مطبوع للدرس" },
      { key: "sort_order", header: "ترتيب العرض", example: 1 },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: ["phys-g10-u1-l1", "ملخص الدرس — PDF", "phys-g10-u1-l1-summary.pdf", "summary", "ملخص مطبوع", 1, "مسودة"],
    notes: [...COMMON_NOTES, "لا تضع روابط signed URL هنا — فقط اسم الملف أو وصف.", "الرفع الفعلي يتم لاحقاً عبر لوحة الإدارة."],
  },
  {
    file: "curriculum_mapping_template.xlsx",
    sheet: "ربط المناهج",
    title: "نموذج ربط المناهج والمحافظات",
    purpose: "توثيق أي منهج يُعرض لأي محافظة/صف/مادة.",
    columns: [
      { key: "governorate_name", header: "اسم المحافظة", required: true, example: "عدن" },
      { key: "track_code", header: "كود المنهج", required: true, example: "aden", note: "المصدر الرسمي: curriculum_track_id" },
      { key: "grade_slug", header: "كود الصف", example: "grade-10" },
      { key: "subject_code", header: "كود المادة (اختياري)", example: "phys-g10-aden" },
      { key: "notes", header: "ملاحظات", example: "مأرب = عدن افتراضياً" },
      { key: "review_status", header: "حالة المراجعة", example: "معتمد" },
    ],
    exampleRow: ["عدن", "aden", "grade-10", "phys-g10-aden", "منهج عدن للصف الأول الثانوي", "معتمد"],
    notes: [...COMMON_NOTES, "المصدر الرسمي للمنهج هو curriculum_track_id — لا تعتمد governorate وحدها.", "تعز = عدن افتراضياً مع السماح بصنعاء."],
  },
  {
    file: "lesson_mind_map_html_template.xlsx",
    sheet: "خرائط ذهنية HTML",
    title: "نموذج خرائط ذهنية HTML للدرس",
    purpose: "تجهيز خرائط Gemini/أدوات مشابهة — ملف HTML واحد self-contained لكل خريطة.",
    columns: [
      { key: "subject_code", header: "كود المادة", required: true, example: "phys-g10-aden" },
      { key: "unit_code", header: "كود الوحدة", example: "phys-g10-aden-u01" },
      { key: "lesson_slug", header: "كود الدرس", required: true, example: "phys-g10-u1-l1" },
      { key: "map_title", header: "عنوان الخريطة الذهنية", required: true, example: "خريطة وحدات القياس" },
      { key: "short_description", header: "وصف مختصر", example: "ملخص بصري لمفاهيم الدرس" },
      { key: "resource_type", header: "نوع المورد", required: true, example: "mind_map_html", note: "ثابت: mind_map_html" },
      { key: "html_filename", header: "اسم ملف HTML", required: true, example: "phys-g10-u1-l1-mindmap.html" },
      { key: "file_url", header: "رابط الملف إن وُجد", example: "", note: "رابط داخلي/staging فقط — لا أسرار" },
      { key: "is_interactive", header: "هل الخريطة تفاعلية؟", example: "نعم", note: "نعم / لا" },
      { key: "mobile_friendly", header: "مناسبة للجوال؟", example: "نعم" },
      { key: "display_direction", header: "اتجاه العرض", example: "RTL", note: "RTL" },
      { key: "language", header: "اللغة", example: "العربية" },
      { key: "design_notes", header: "ملاحظات لفريق التصميم", example: "بدون مكتبات خارجية ثقيلة" },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: ["phys-g10-aden", "phys-g10-aden-u01", "phys-g10-u1-l1", "خريطة وحدات القياس", "ملخص بصري", "mind_map_html", "phys-g10-u1-l1-mindmap.html", "", "نعم", "نعم", "RTL", "العربية", "self-contained، RTL، بدون scripts غير موثوقة", "مسودة"],
    notes: [
      ...COMMON_NOTES,
      "الخريطة HTML واحدة قابلة للعرض داخل WebView أو iframe.",
      "يجب أن تدعم الجوال وRTL.",
      "لا تعتمد على مكتبات خارجية ثقيلة إن أمكن.",
      "لا scripts غير موثوقة — لا روابط تتبع.",
      "يفضّل self-contained HTML — لا تضع كود HTML كامل داخل Excel؛ ضع اسم الملف فقط.",
    ],
  },
  {
    file: "lesson_lab_simulation_html_template.xlsx",
    sheet: "تجارب عملية HTML",
    title: "نموذج التجارب العملية / PhET",
    purpose: "تجهيز محاكاة PhET أو HTML داخلي مرتبط بالدروس.",
    columns: [
      { key: "subject_code", header: "كود المادة", required: true, example: "phys-g10-aden" },
      { key: "unit_code", header: "كود الوحدة", example: "phys-g10-aden-u01" },
      { key: "lesson_slug", header: "كود الدرس", required: true, example: "phys-g10-u1-l1" },
      { key: "lab_name", header: "اسم التجربة", required: true, example: "محاكاة قياس الكتلة والحجم" },
      { key: "lab_description", header: "وصف التجربة", example: "تجربة تفاعلية لفهم الكثافة" },
      { key: "science_subject", header: "المادة العلمية", example: "فيزياء", note: "فيزياء | كيمياء | أحياء | رياضيات" },
      { key: "lab_type", header: "نوع التجربة", required: true, example: "PhET", note: "PhET | HTML داخلي | رابط خارجي" },
      { key: "phet_official_url", header: "رابط PhET الرسمي", example: "https://phet.colorado.edu/sims/html/density/latest/density_all.html", note: "إلزامي إذا النوع PhET" },
      { key: "html_filename", header: "اسم ملف HTML", example: "phys-g10-u1-l1-density-wrapper.html" },
      { key: "html_file_url", header: "رابط ملف HTML إن وُجد", example: "" },
      { key: "works_offline", header: "هل يعمل Offline؟", example: "لا", note: "نعم / لا" },
      { key: "mobile_friendly", header: "هل مناسب للجوال؟", example: "نعم" },
      { key: "needs_internet", header: "هل يحتاج إنترنت؟", example: "نعم" },
      { key: "lab_language", header: "لغة التجربة", example: "متعدد", note: "عربي | إنجليزي | متعدد" },
      { key: "student_instructions", header: "تعليمات الطالب قبل التجربة", example: "اقرأ التعليمات ثم جرّب تغيير الحجم" },
      { key: "follow_up_questions", header: "أسئلة مرافقة بعد التجربة", example: "ما العلاقة بين الكتلة والحجم؟" },
      { key: "safety_notes", header: "ملاحظات السلامة", example: "لا ينطبق — محاكاة رقمية" },
      { key: "review_status", header: "حالة المراجعة", example: "مسودة" },
    ],
    exampleRow: [
      "phys-g10-aden", "phys-g10-aden-u01", "phys-g10-u1-l1", "محاكاة الكثافة",
      "تجربة تفاعلية لفهم الكثافة", "فيزياء", "PhET",
      "https://phet.colorado.edu/sims/html/density/latest/density_all.html",
      "phys-g10-u1-l1-density-wrapper.html", "", "لا", "نعم", "نعم", "متعدد",
      "اقرأ التعليمات ثم جرّب تغيير الحجم", "ما العلاقة بين الكتلة والحجم؟",
      "لا ينطبق — محاكاة رقمية", "مسودة",
    ],
    notes: [
      ...COMMON_NOTES,
      "إذا كانت التجربة من PhET ضع رابط PhET الرسمي فقط — لا تنسخ المحاكاة.",
      "يفضّل HTML wrapper آمن ي embed الرابط الرسمي.",
      "وثّق هل تحتاج إنترنت أو تعمل Offline.",
      "لا scripts غير موثوقة — لا روابط تحميل عشوائية.",
      "PhET: https://phet.colorado.edu/",
    ],
  },
];

function fillDataSheet(ws, columns, exampleRow) {
  ws.views = [{ rightToLeft: true }];
  ws.columns = columns.map((c) => ({
    header: c.required ? `${c.header} *` : c.header,
    key: c.key,
    width: Math.max(16, c.header.length + 6),
  }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 28;
  ws.addRow(exampleRow);
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
    ws.addRow([c.header + (c.required ? " *" : ""), [c.note ? `ملاحظة: ${c.note}` : "", `مثال: ${c.example}`].filter(Boolean).join(" — ")]);
  }
  if (t.extraSheets) {
    for (const s of t.extraSheets) {
      ws.addRow([]);
      ws.addRow([`— شيت: ${s.name} —`]).font = { bold: true };
      for (const c of s.columns) {
        ws.addRow([c.header + (c.required ? " *" : ""), [c.note ? `ملاحظة: ${c.note}` : "", `مثال: ${c.example}`].filter(Boolean).join(" — ")]);
      }
    }
  }
  ws.addRow([]);
  ws.addRow(["— تعليمات عامة —"]).font = { bold: true };
  for (const n of t.notes) ws.addRow(["•", n]);
}

async function generate(t) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Content Prep Templates";
  wb.created = new Date("2026-06-23T00:00:00.000Z");
  fillInstructionsSheet(wb.addWorksheet("تعليمات"), t);
  fillDataSheet(wb.addWorksheet(t.sheet), t.columns, t.exampleRow);
  if (t.extraSheets) {
    for (const s of t.extraSheets) fillDataSheet(wb.addWorksheet(s.name), s.columns, s.exampleRow);
  }
  await wb.xlsx.writeFile(join(OUT_DIR, t.file));
  console.log("✓", t.file);
}

for (const t of templates) await generate(t);
console.log(`\nGenerated ${templates.length} templates in ${OUT_DIR}`);
