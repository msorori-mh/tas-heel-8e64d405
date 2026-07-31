/**
 * Generate official content-prep Excel templates for lesson upload planning.
 * Run: node scripts/generate-content-templates.mjs
 */
import ExcelJS from "exceljs";
import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "content-templates");
mkdirSync(OUT_DIR, { recursive: true });

const EDITOR_ONLY_WARNING =
  "⚠️ تنبيه: أعمدة «رقم الإجابة الصحيحة» و«شرح الإجابة» مخصصة لفريق التحرير فقط ولا تظهر للطلاب مباشرة.";

const COMMON_NOTES = [
  "هذه النماذج لتجهيز المحتوى قبل الاستيراد — لا تستورد بيانات فعلية من هنا تلقائياً.",
  "استخدم أكواداً نصية ثابتة (snake_case أو kebab-case) — لا تستخدم UUID.",
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
      { key: "subject_code", header: "subject_code", required: true, example: "phys-g10-aden", note: "كود فريد للمادة" },
      { key: "name", header: "name", required: true, example: "التربية الإسلامية - السيرة النبوية", note: "مادة عادية: «الفيزياء» — مادة مقسّمة: «المادة الكبرى - القسم»" },
      { key: "grade_slug", header: "grade_slug", required: true, example: "grade-10" },
      { key: "track_code", header: "track_code", example: "aden", note: "sanaa | aden" },
      { key: "semester", header: "semester", example: 1, note: "1 أو 2" },
      { key: "icon", header: "icon", example: "⚛️" },
      { key: "color", header: "color", example: "#dc2626", note: "HEX" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "editor_notes", header: "editor_notes", example: "راجع مع منسق المادة" },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [
      ["phys-g10-aden", "الفيزياء", "grade-10", "aden", 1, "⚛️", "#dc2626", 9, "", "مسودة"],
      ["islam-g10-sira", "التربية الإسلامية - السيرة النبوية", "grade-10", "", 1, "BookOpen", "#27ae60", 2, "", "مسودة"],
    ],
    notes: [
      ...COMMON_NOTES,
      "ابدأ بتحديد grade_slug و track_code قبل تعبئة المواد.",
      "تقسيم المواد: الاسم بصيغة «اسم المادة الكبرى - اسم القسم الفرعي» والفاصل مسافة + شرطة + مسافة (\" - \") حرفياً.",
      "المعتمد دائماً «التربية الإسلامية - ...» — لا تستخدم «الإسلامية - ...».",
      "وحّد هجاء اسم المادة الكبرى عبر كل أقسامها وإلا ظهرت كمواد منفصلة للطالب.",
      "القيم المعتمدة للصف الأول: docs/SUBJECT-GROUPING-GRADE-10-YEMEN-CONTENT-GUIDE.md",
    ],
  },
  {
    file: "02_units_template.xlsx",
    sheet: "الوحدات",
    title: "02 — نموذج الوحدات",
    purpose: "تجهيز وحدات كل مادة.",
    columns: [
      { key: "unit_code", header: "unit_code", required: true, example: "phys-g10-aden-u01" },
      { key: "subject_code", header: "subject_code", required: true, example: "phys-g10-aden" },
      { key: "title", header: "title", required: true, example: "الوحدة الأولى: القياس والأخطاء" },
      { key: "description", header: "description", example: "مقدمة في القياس الفيزيائي" },
      { key: "semester", header: "semester", example: 1 },
      { key: "is_free", header: "is_free", example: "لا", note: "نعم / لا" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [["phys-g10-aden-u01", "phys-g10-aden", "الوحدة الأولى: القياس والأخطاء", "مقدمة في القياس", 1, "لا", 1, "مسودة"]],
    notes: [...COMMON_NOTES, "unit_code يجب أن يرتبط بـ subject_code من نموذج 01."],
  },
  {
    file: "03_lessons_template.xlsx",
    sheet: "الدروس",
    title: "03 — نموذج الدروس",
    purpose: "تجهيز قائمة الدروس لكل وحدة.",
    columns: [
      { key: "lesson_code", header: "lesson_code", required: true, example: "phys-g10-u1-l1", note: "كود الدرس — فريد" },
      { key: "subject_code", header: "subject_code", required: true, example: "phys-g10-aden" },
      { key: "unit_code", header: "unit_code", example: "phys-g10-aden-u01" },
      { key: "title", header: "title", required: true, example: "الدرس 1: وحدات القياس" },
      { key: "duration", header: "duration", example: "25 دقيقة" },
      { key: "semester", header: "semester", example: 1 },
      { key: "is_free", header: "is_free", example: "لا" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [["phys-g10-u1-l1", "phys-g10-aden", "phys-g10-aden-u01", "الدرس 1: وحدات القياس", "25 دقيقة", 1, "لا", 1, "مسودة"]],
    notes: [...COMMON_NOTES, "lesson_code يُستخدم في كل النماذج التالية (04–09)."],
  },
  {
    file: "04_lesson_book_contents_template.xlsx",
    sheet: "محتوى الكتاب",
    title: "04 — نموذج محتوى الكتاب",
    purpose: "نص الدرس الرئيسي (Markdown) وربط PDF اختياري.",
    columns: [
      { key: "lesson_code", header: "lesson_code", required: true, example: "phys-g10-u1-l1" },
      { key: "content", header: "content", required: true, example: "## مقدمة\nوحدات القياس...", note: "Markdown مدعوم" },
      { key: "pdf_url", header: "pdf_url", example: "", note: "رابط PDF عام إن وُجد — اتركه فارغاً إن لم يتوفر" },
      { key: "editor_notes", header: "editor_notes", example: "راجع المصطلحات" },
    ],
    exampleRows: [["phys-g10-u1-l1", "## مقدمة\nوحدات القياس هي أساس الفيزياء...", "", ""]],
    notes: [...COMMON_NOTES, "صف واحد لكل درس في محتوى الكتاب."],
  },
  {
    file: "05_lesson_explanations_template.xlsx",
    sheet: "الشروحات",
    title: "05 — نموذج شروحات الدرس",
    purpose: "شروحات إضافية متعددة لكل درس.",
    columns: [
      { key: "lesson_code", header: "lesson_code", required: true, example: "phys-g10-u1-l1" },
      { key: "title", header: "title", required: true, example: "شرح النظام الدولي للوحدات" },
      { key: "content", header: "content", required: true, example: "النظام الدولي SI يعتمد على..." },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [["phys-g10-u1-l1", "شرح النظام الدولي للوحدات", "النظام الدولي SI...", 1, "مسودة"]],
    notes: [...COMMON_NOTES, "يمكن إضافة أكثر من شرح لنفس lesson_code."],
  },
  {
    file: "06_lesson_resources_template.xlsx",
    sheet: "موارد الدرس",
    title: "06 — نموذج موارد الدرس",
    purpose: "فيديو، خريطة ذهنية، تجربة HTML، PDF، وروابط خارجية.",
    columns: [
      { key: "lesson_code", header: "lesson_code", required: true, example: "phys-g10-u1-l1" },
      { key: "resource_type", header: "resource_type", required: true, example: "video", note: RESOURCE_TYPES_NOTE },
      { key: "title", header: "title", required: true, example: "شرح وحدات القياس" },
      { key: "description", header: "description", example: "فيديو YouTube تعليمي" },
      { key: "resource_url", header: "resource_url", example: "https://www.youtube.com/watch?v=example", note: "رابط خارجي أو embed رسمي" },
      { key: "resource_format", header: "resource_format", example: "url", note: "url | html | pdf" },
      { key: "local_asset_path", header: "local_asset_path", example: "assets/phys-g10-u1-l1-mindmap.html", note: "مسار نسبي للملف المحلي" },
      { key: "thumbnail_url", header: "thumbnail_url", example: "", note: "اختياري" },
      { key: "is_interactive", header: "is_interactive", example: "نعم", note: "نعم / لا" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "attribution", header: "attribution", example: "PhET Interactive Simulations", note: "إلزامي للموارد الخارجية" },
      { key: "license_note", header: "license_note", example: "CC BY — احتفظ بالنسب", note: "لا تحذف attribution إلا إذا يسمح الترخيص" },
      { key: "notes", header: "notes", example: "رابط خارجي فقط" },
    ],
    exampleRows: [
      ["phys-g10-u1-l1", "video", "شرح وحدات القياس", "فيديو YouTube تعليمي", "https://www.youtube.com/watch?v=example", "url", "", "", "لا", 1, "قناة تعليمية — مثال", "YouTube Standard License", "رابط خارجي — تحقق من حقوق النشر"],
      ["phys-g10-u1-l1", "mindmap", "خريطة وحدات القياس", "خريطة HTML self-contained", "", "html", "assets/phys-g10-u1-l1-mindmap.html", "", "نعم", 2, "أداة Gemini — مثال", "CC BY-SA — احتفظ بالنسب", "ملف HTML محلي — RTL وجوال"],
      ["phys-g10-u1-l1", "experiment", "محاكاة الكثافة", "تجربة PhET مع wrapper HTML", "https://phet.colorado.edu/sims/html/density/latest/density_all.html", "html", "assets/phys-g10-u1-l1-density.html", "", "نعم", 3, "PhET Interactive Simulations", "PhET CC BY — لا تنسخ المحاكاة", "embed الرابط الرسمي فقط"],
      ["phys-g10-u1-l1", "pdf", "ملخص الدرس — PDF", "ملف PDF للطباعة", "", "pdf", "assets/phys-g10-u1-l1-summary.pdf", "", "لا", 4, "إنتاج داخلي", "حقوق داخلية", "يُرفع الملف لاحقاً عبر لوحة الإدارة"],
      ["phys-g10-u1-l1", "link", "مرجع وزارة التربية", "رابط مرجع رسمي", "https://example.gov.ye/curriculum", "url", "", "", "لا", 5, "وزارة التربية والتعليم", "رابط عام — تحقق من الترخيص", "لا تزِل attribution للموارد المرخّصة"],
    ],
    notes: [
      ...COMMON_NOTES,
      RESOURCE_TYPES_NOTE,
      "mindmap: ضع ملف HTML في local_asset_path — self-contained، RTL، مناسب للجوال.",
      "experiment: resource_format=html — wrapper ي embed رابط PhET أو محاكاة HTML آمنة.",
      "pdf: local_asset_path يشير لملف PDF المحلي — resource_url يبقى فارغاً عادة.",
      "video: resource_url = رابط YouTube/Vimeo — لا رفع فيديو داخل التطبيق.",
      "⚠️ أي مورد خارجي: احترم الترخيص ولا تحذف attribution إلا إذا كان الترخيص يسمح بذلك.",
    ],
  },
  {
    file: "07_lesson_assessments_template.xlsx",
    sheet: "اختبارات الدرس",
    title: "07 — نموذج اختبارات/تقييمات الدرس",
    purpose: "اختبارات قصيرة مرتبطة بدرس واحد (قبل ربط الأسئلة في 08).",
    columns: [
      { key: "assessment_code", header: "assessment_code", required: true, example: "ASMT-PHYS-G10-U1-L1" },
      { key: "lesson_code", header: "lesson_code", required: true, example: "phys-g10-u1-l1" },
      { key: "title", header: "title", required: true, example: "اختبار قصير — وحدات القياس" },
      { key: "instructions", header: "instructions", example: "أجب عن جميع الأسئلة خلال 10 دقائق" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [["ASMT-PHYS-G10-U1-L1", "phys-g10-u1-l1", "اختبار قصير — وحدات القياس", "أجب خلال 10 دقائق", 1, "مسودة"]],
    notes: [...COMMON_NOTES, "اربط الأسئلة في نموذج 08_assessment_questions_template."],
  },
  {
    file: "08_assessment_questions_template.xlsx",
    sheet: "أسئلة الاختبار",
    title: "08 — نموذج ربط أسئلة الاختبار",
    purpose: "ربط أسئلة (من نموذج 09) باختبار درس (من نموذج 07).",
    editorOnlyWarning: EDITOR_ONLY_WARNING,
    columns: [
      { key: "assessment_code", header: "assessment_code", required: true, example: "ASMT-PHYS-G10-U1-L1" },
      { key: "question_code", header: "question_code", required: true, example: "Q-PHYS-G10-U1-L1-001" },
      { key: "sort_order", header: "sort_order", example: 1 },
      { key: "points", header: "points", example: 1 },
      { key: "editor_notes", header: "editor_notes", example: "" },
    ],
    exampleRows: [["ASMT-PHYS-G10-U1-L1", "Q-PHYS-G10-U1-L1-001", 1, 1, ""]],
    notes: [...COMMON_NOTES, "question_code يجب أن يطابق نموذج 09.", EDITOR_ONLY_WARNING],
  },
  {
    file: "09_questions_template.xlsx",
    sheet: "بنك الأسئلة",
    title: "09 — نموذج بنك الأسئلة",
    purpose: "أسئلة MCQ على مستوى الدرس أو المادة.",
    editorOnlyWarning: EDITOR_ONLY_WARNING,
    columns: [
      { key: "question_code", header: "question_code", required: true, example: "Q-PHYS-G10-U1-L1-001" },
      { key: "lesson_code", header: "lesson_code", example: "phys-g10-u1-l1", note: "اختياري — للأسئلة العامة اتركه فارغاً" },
      { key: "subject_code", header: "subject_code", example: "phys-g10-aden" },
      { key: "question_text", header: "question_text", required: true, example: "ما وحدة قياس القوة في SI؟" },
      { key: "option_1", header: "option_1", required: true, example: "نيوتن" },
      { key: "option_2", header: "option_2", required: true, example: "جول" },
      { key: "option_3", header: "option_3", example: "واط" },
      { key: "option_4", header: "option_4", example: "باسكال" },
      { key: "option_5", header: "option_5", example: "" },
      { key: "option_6", header: "option_6", example: "" },
      { key: "correct_index", header: "correct_index", required: true, example: 1, note: "1=option_1 … 6=option_6 — للمحررين فقط" },
      { key: "explanation", header: "explanation", example: "القوة تُقاس بالنيوتن", note: "للمحررين فقط" },
      { key: "review_status", header: "review_status", example: "مسودة" },
    ],
    exampleRows: [
      ["Q-PHYS-G10-U1-L1-001", "phys-g10-u1-l1", "phys-g10-aden", "ما وحدة قياس القوة في SI؟", "نيوتن", "جول", "واط", "باسكال", "", "", 1, "القوة تُقاس بالنيوتن", "مسودة"],
    ],
    notes: [...COMMON_NOTES, EDITOR_ONLY_WARNING, "اجعل أعمدة الخيارات بصيغة Text في Excel."],
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

async function generate(t) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Content Upload Templates — Tanoir";
  wb.created = new Date("2026-07-03T00:00:00.000Z");
  fillInstructionsSheet(wb.addWorksheet("تعليمات"), t);
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
