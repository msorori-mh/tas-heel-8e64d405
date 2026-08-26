/**
 * Generate 12 Excel import templates under public/import-templates/
 * Run with: npm run generate:import-templates
 * (or: bun run scripts/generate-import-templates.ts)
 */
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

type Col = { key: string; label: string; required: boolean; example: any; note?: string };
type Template = {
  file: string;
  sheet: string;
  description: string;
  importOrder: number;
  upsertKey: string;
  columns: Col[];
  examples: any[][]; // additional example rows (besides one built from `example` field)
  extraSheets?: { name: string; columns: Col[]; examples: any[][] }[];
  notes: string[];
};

const OUT_DIR = join(process.cwd(), "public", "import-templates");
mkdirSync(OUT_DIR, { recursive: true });

const templates: Template[] = [
  {
    file: "01_curriculum_tracks_template.xlsx",
    sheet: "curriculum_tracks",
    importOrder: 1,
    upsertKey: "track_code",
    description: "مسارات المناهج (صنعاء/عدن/...)",
    columns: [
      {
        key: "track_code",
        label: "track_code",
        required: true,
        example: "sanaa",
        note: "snake_case، فريد",
      },
      { key: "track_name", label: "track_name", required: true, example: "منهج صنعاء" },
      { key: "description", label: "description", required: false, example: "" },
      {
        key: "is_active",
        label: "is_active",
        required: false,
        example: "TRUE",
        note: "TRUE/FALSE — افتراضي TRUE",
      },
    ],
    examples: [["aden", "منهج عدن", "", "TRUE"]],
    notes: ["لا تستخدم UUIDs", "track_code يجب أن يكون فريداً"],
  },
  {
    file: "02_governorates_template.xlsx",
    sheet: "governorates",
    importOrder: 2,
    upsertKey: "name",
    description: "المحافظات",
    columns: [
      { key: "name", label: "name", required: true, example: "صنعاء" },
      {
        key: "default_track_code",
        label: "default_track_code",
        required: false,
        example: "sanaa",
        note: "FK إلى curriculum_tracks.track_code",
      },
      { key: "sort_order", label: "sort_order", required: false, example: 1 },
    ],
    examples: [["عدن", "aden", 2]],
    notes: ["يجب رفع 01_curriculum_tracks أولاً"],
  },
  {
    file: "03_governorate_curriculum_map_template.xlsx",
    sheet: "governorate_curriculum_map",
    importOrder: 3,
    upsertKey: "(governorate_name, track_code)",
    description: "ربط المحافظات بالمناهج المسموح بها",
    columns: [
      { key: "governorate_name", label: "governorate_name", required: true, example: "صنعاء" },
      { key: "track_code", label: "track_code", required: true, example: "sanaa" },
    ],
    examples: [["عدن", "aden"]],
    notes: ["FK مزدوج", "يتطلب 01 + 02"],
  },
  {
    file: "04_grades_template.xlsx",
    sheet: "grades",
    importOrder: 4,
    upsertKey: "slug",
    description: "الصفوف الدراسية",
    columns: [
      { key: "slug", label: "slug", required: true, example: "grade-10", note: "kebab-case" },
      { key: "name", label: "name", required: true, example: "الصف الأول الثانوي" },
      { key: "category", label: "category", required: true, example: "secondary" },
      { key: "track_code", label: "track_code", required: false, example: "sanaa" },
      { key: "sort_order", label: "sort_order", required: false, example: 1 },
    ],
    examples: [["grade-11-sci", "الصف الثاني الثانوي - علمي", "secondary", "sanaa", 2]],
    notes: [],
  },
  {
    file: "05_subjects_template.xlsx",
    sheet: "subjects",
    importOrder: 5,
    upsertKey: "subject_code",
    description: "المواد الدراسية",
    columns: [
      {
        key: "subject_code",
        label: "subject_code",
        required: true,
        example: "math-g10-sanaa",
        note: "يُحفظ في عمود code الجديد — فريد عالمياً",
      },
      { key: "slug", label: "slug", required: true, example: "math" },
      { key: "name", label: "name", required: true, example: "الرياضيات" },
      { key: "grade_slug", label: "grade_slug", required: true, example: "grade-10" },
      { key: "track_code", label: "track_code", required: false, example: "sanaa" },
      { key: "semester", label: "semester", required: false, example: 1, note: "1 أو 2" },
      { key: "icon", label: "icon", required: false, example: "📐" },
      { key: "color", label: "color", required: false, example: "#2563eb" },
      { key: "sort_order", label: "sort_order", required: false, example: 1 },
    ],
    examples: [
      ["phys-g10-sanaa", "physics", "الفيزياء", "grade-10", "sanaa", 1, "⚛️", "#dc2626", 2],
    ],
    notes: ["subject_code فريد عالمياً", "يتطلب 04_grades + 01_curriculum_tracks"],
  },
  {
    file: "06_units_template.xlsx",
    sheet: "units",
    importOrder: 6,
    upsertKey: "(subject_code, unit_code)",
    description: "الوحدات داخل المواد",
    columns: [
      {
        key: "unit_code",
        label: "unit_code",
        required: true,
        example: "math-g10-sanaa-u01",
        note: "فريد ضمن المادة",
      },
      { key: "subject_code", label: "subject_code", required: true, example: "math-g10-sanaa" },
      { key: "title", label: "title", required: true, example: "الوحدة الأولى: الأعداد الحقيقية" },
      { key: "description", label: "description", required: false, example: "" },
      { key: "sort_order", label: "sort_order", required: false, example: 1 },
      { key: "semester", label: "semester", required: false, example: 1, note: "1 أو 2" },
      { key: "is_free", label: "is_free", required: false, example: "FALSE", note: "TRUE/FALSE" },
    ],
    examples: [
      ["math-g10-sanaa-u02", "math-g10-sanaa", "الوحدة الثانية: المعادلات", "", 2, 1, "FALSE"],
    ],
    notes: ["يتطلب 05_subjects"],
  },
  {
    file: "07_lessons_template.xlsx",
    sheet: "lessons",
    importOrder: 7,
    upsertKey: "lesson_slug",
    description: "الدروس",
    columns: [
      {
        key: "lesson_slug",
        label: "lesson_slug",
        required: true,
        example: "math-g10-u1-l1",
        note: "فريد عالمياً",
      },
      { key: "subject_code", label: "subject_code", required: true, example: "math-g10-sanaa" },
      {
        key: "unit_code",
        label: "unit_code",
        required: false,
        example: "math-g10-sanaa-u01",
        note: "يجب أن يخص نفس المادة",
      },
      { key: "title", label: "title", required: true, example: "الدرس الأول: الأعداد النسبية" },
      { key: "duration", label: "duration", required: false, example: "25 دقيقة" },
      { key: "video_url", label: "video_url", required: false, example: "" },
      { key: "content_pdf_url", label: "content_pdf_url", required: false, example: "" },
      { key: "semester", label: "semester", required: false, example: 1 },
      { key: "is_free", label: "is_free", required: false, example: "FALSE" },
      { key: "sort_order", label: "sort_order", required: false, example: 1 },
    ],
    examples: [
      [
        "math-g10-u1-l2",
        "math-g10-sanaa",
        "math-g10-sanaa-u01",
        "الدرس الثاني: الأعداد غير النسبية",
        "30 دقيقة",
        "",
        "",
        1,
        "FALSE",
        2,
      ],
    ],
    notes: ["يتطلب 05 + 06"],
  },
  {
    file: "08_lesson_contents_template.xlsx",
    sheet: "book_content",
    importOrder: 8,
    upsertKey: "lesson_slug (per sheet)",
    description: "محتوى الدروس (4 شيتات: book_content / summary / explanations / resources)",
    columns: [
      { key: "lesson_slug", label: "lesson_slug", required: true, example: "math-g10-u1-l1" },
      { key: "content", label: "content", required: false, example: "نص المحتوى (Markdown مدعوم)" },
      { key: "pdf_url", label: "pdf_url", required: false, example: "" },
    ],
    examples: [],
    extraSheets: [
      {
        name: "summary",
        columns: [
          { key: "lesson_slug", label: "lesson_slug", required: true, example: "math-g10-u1-l1" },
          { key: "summary", label: "summary", required: true, example: "ملخص قصير للدرس" },
          {
            key: "key_points",
            label: "key_points",
            required: false,
            example: "نقطة 1|نقطة 2|نقطة 3",
            note: "افصل بـ |",
          },
          { key: "study_tip", label: "study_tip", required: false, example: "ركز على الأمثلة" },
        ],
        examples: [],
      },
      {
        name: "explanations",
        columns: [
          { key: "lesson_slug", label: "lesson_slug", required: true, example: "math-g10-u1-l1" },
          { key: "title", label: "title", required: true, example: "شرح المفهوم الأساسي" },
          { key: "content", label: "content", required: true, example: "..." },
          { key: "sort_order", label: "sort_order", required: false, example: 1 },
        ],
        examples: [],
      },
      {
        name: "resources",
        columns: [
          { key: "lesson_slug", label: "lesson_slug", required: true, example: "math-g10-u1-l1" },
          {
            key: "resource_type",
            label: "resource_type",
            required: true,
            example: "video",
            note: "video|pdf|link|mindmap|experiment",
          },
          { key: "title", label: "title", required: true, example: "فيديو شرح" },
          { key: "url", label: "url", required: true, example: "https://..." },
          { key: "description", label: "description", required: false, example: "" },
          { key: "sort_order", label: "sort_order", required: false, example: 1 },
        ],
        examples: [],
      },
    ],
    notes: ["يتطلب 07_lessons", "كل شيت مستقل بمفتاحه"],
  },
  {
    file: "09_questions_template.xlsx",
    sheet: "questions",
    importOrder: 9,
    upsertKey: "question_code (أو hash لو فارغ)",
    description: "بنك الأسئلة — الأهم",
    columns: [
      {
        key: "question_code",
        label: "question_code",
        required: false,
        example: "Q-MATH-G10-001",
        note: "يُولّد تلقائياً إن لم يوجد",
      },
      {
        key: "lesson_slug",
        label: "lesson_slug",
        required: false,
        example: "math-g10-u1-l1",
        note: "هذا أو subject_code إلزامي",
      },
      { key: "subject_code", label: "subject_code", required: false, example: "math-g10-sanaa" },
      {
        key: "question_text",
        label: "question_text",
        required: true,
        example: "كم يساوي 2+2؟",
        note: "≤ 2000 حرف",
      },
      { key: "option_1", label: "option_1", required: true, example: "3" },
      { key: "option_2", label: "option_2", required: true, example: "4" },
      { key: "option_3", label: "option_3", required: false, example: "5" },
      { key: "option_4", label: "option_4", required: false, example: "6" },
      { key: "option_5", label: "option_5", required: false, example: "" },
      { key: "option_6", label: "option_6", required: false, example: "" },
      {
        key: "correct_index",
        label: "correct_index",
        required: true,
        example: 2,
        note: "1-based (يطابق option_X)",
      },
      { key: "explanation", label: "explanation", required: false, example: "لأن 2+2=4" },
      {
        key: "question_type",
        label: "question_type",
        required: false,
        example: "mcq",
        note: "افتراضي mcq",
      },
      { key: "year", label: "year", required: false, example: 2023 },
      { key: "semester", label: "semester", required: false, example: 1 },
      { key: "sort_order", label: "sort_order", required: false, example: 1 },
    ],
    examples: [
      [
        "Q-MATH-G10-002",
        "math-g10-u1-l1",
        "math-g10-sanaa",
        "ما ناتج 5×3؟",
        "8",
        "15",
        "12",
        "10",
        "",
        "",
        2,
        "5×3 = 15",
        "mcq",
        2024,
        1,
        2,
      ],
    ],
    notes: [
      "اجعل عمود option_* بصيغة Text لتفادي تحويل Excel للأرقام",
      "correct_index 1-based: 1=option_1 ... 6=option_6",
      "إما lesson_slug أو subject_code يجب أن يوجد",
    ],
  },
  {
    file: "10_exam_templates_template.xlsx",
    sheet: "templates",
    importOrder: 10,
    upsertKey: "template_code",
    description: "نماذج الاختبارات + ربط الأسئلة (شيتان)",
    columns: [
      {
        key: "template_code",
        label: "template_code",
        required: true,
        example: "EXAM-MATH-G10-001",
      },
      { key: "title", label: "title", required: true, example: "اختبار الوحدة الأولى" },
      { key: "description", label: "description", required: false, example: "" },
      {
        key: "mode",
        label: "mode",
        required: true,
        example: "training",
        note: "training|strict|ministry",
      },
      { key: "subject_code", label: "subject_code", required: false, example: "math-g10-sanaa" },
      { key: "unit_code", label: "unit_code", required: false, example: "math-g10-sanaa-u01" },
      { key: "lesson_slug", label: "lesson_slug", required: false, example: "" },
      { key: "duration_seconds", label: "duration_seconds", required: false, example: 1800 },
      { key: "is_active", label: "is_active", required: false, example: "TRUE" },
    ],
    examples: [],
    extraSheets: [
      {
        name: "template_questions",
        columns: [
          {
            key: "template_code",
            label: "template_code",
            required: true,
            example: "EXAM-MATH-G10-001",
          },
          {
            key: "question_code",
            label: "question_code",
            required: true,
            example: "Q-MATH-G10-001",
          },
          { key: "sort_order", label: "sort_order", required: false, example: 1 },
          { key: "points", label: "points", required: false, example: 1 },
        ],
        examples: [["EXAM-MATH-G10-001", "Q-MATH-G10-002", 2, 1]],
      },
    ],
    notes: ["يتطلب 05 + 06 + 07 + 09"],
  },
  {
    file: "11_subscription_plans_template.xlsx",
    sheet: "subscription_plans",
    importOrder: 11,
    upsertKey: "(name, duration_months)",
    description: "خطط الاشتراك",
    columns: [
      { key: "name", label: "name", required: true, example: "اشتراك شهري" },
      {
        key: "duration_type",
        label: "duration_type",
        required: false,
        example: "monthly",
        note: "monthly|semester|year",
      },
      { key: "duration_months", label: "duration_months", required: true, example: 1 },
      { key: "price", label: "price", required: true, example: 2500 },
      { key: "currency", label: "currency", required: false, example: "YER", note: "افتراضي YER" },
      { key: "is_active", label: "is_active", required: false, example: "TRUE" },
      { key: "sort_order", label: "sort_order", required: false, example: 1 },
    ],
    examples: [["اشتراك فصلي", "semester", 4, 8000, "YER", "TRUE", 2]],
    notes: ["لا تعدّل بيانات اشتراكات الطلاب الحالية"],
  },
  {
    file: "12_payment_methods_template.xlsx",
    sheet: "payment_methods",
    importOrder: 12,
    upsertKey: "(type, name)",
    description: "وسائل الدفع",
    columns: [
      {
        key: "type",
        label: "type",
        required: true,
        example: "bank",
        note: "bank|exchange|ewallet|...",
      },
      { key: "name", label: "name", required: true, example: "بنك الكريمي" },
      { key: "account_name", label: "account_name", required: false, example: "تمكين" },
      {
        key: "account_number",
        label: "account_number",
        required: false,
        example: "1234567890",
        note: "اجعله Text لتفادي notation",
      },
      { key: "details", label: "details", required: false, example: "" },
      { key: "logo_url", label: "logo_url", required: false, example: "" },
      { key: "barcode_url", label: "barcode_url", required: false, example: "" },
      { key: "is_active", label: "is_active", required: false, example: "TRUE" },
      { key: "sort_order", label: "sort_order", required: false, example: 1 },
    ],
    examples: [["ewallet", "محفظة جوّالي", "تمكين", "777123456", "", "", "", "TRUE", 2]],
    notes: ["لا تعدّل المدفوعات الفعلية للطلاب"],
  },
];

function fillSheet(
  ws: ExcelJS.Worksheet,
  columns: Col[],
  firstExample: any[],
  extraExamples: any[][],
) {
  ws.views = [{ rightToLeft: true }];
  ws.columns = columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.max(14, c.label.length + 4),
  }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 24;
  // mark required columns
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    if (c.required) cell.value = c.label + " *";
  });
  ws.addRow(firstExample);
  for (const ex of extraExamples) ws.addRow(ex);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  ws.getRow(1).commit();
}

function fillReadme(ws: ExcelJS.Worksheet, t: Template) {
  ws.views = [{ rightToLeft: true }];
  ws.columns = [
    { header: "العمود", key: "label", width: 24 },
    { header: "إلزامي", key: "req", width: 10 },
    { header: "مثال", key: "ex", width: 30 },
    { header: "ملاحظات", key: "note", width: 60 },
  ];
  ws.getRow(1).font = { bold: true };

  // meta block
  ws.addRow([]);
  ws.addRow(["الملف", t.file]);
  ws.addRow(["الترتيب", t.importOrder]);
  ws.addRow(["مفتاح التحديث (upsert)", t.upsertKey]);
  ws.addRow(["الوصف", t.description]);
  ws.addRow([]);

  ws.addRow(["— الأعمدة —"]).font = { bold: true };
  for (const c of t.columns) {
    ws.addRow([c.label, c.required ? "✅" : "—", String(c.example ?? ""), c.note ?? ""]);
  }
  if (t.extraSheets) {
    for (const s of t.extraSheets) {
      ws.addRow([]);
      ws.addRow([`— شيت: ${s.name} —`]).font = { bold: true };
      for (const c of s.columns) {
        ws.addRow([c.label, c.required ? "✅" : "—", String(c.example ?? ""), c.note ?? ""]);
      }
    }
  }

  ws.addRow([]);
  ws.addRow(["— ملاحظات عامة —"]).font = { bold: true };
  for (const n of t.notes) ws.addRow([n]);
  ws.addRow(["لا تستخدم UUIDs أبداً — فقط الأكواد النصية"]);
  ws.addRow(["ترميز UTF-8، أرقام إنجليزية في الأعمدة الرقمية"]);
  ws.addRow(["TRUE/FALSE للقيم البولية"]);
  ws.addRow(["حد الملف 5 MB، حد الصفوف 10000"]);
}

/** Fixed metadata so regenerated files are byte-stable aside from Excel internals. */
const TEMPLATE_CREATED = new Date("2026-01-01T00:00:00.000Z");

async function generate(t: Template) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tamkeen Import System";
  wb.created = TEMPLATE_CREATED;

  // main sheet
  const main = wb.addWorksheet(t.sheet);
  const exampleRow = t.columns.map((c) => c.example);
  fillSheet(main, t.columns, exampleRow, t.examples);

  // extra sheets
  if (t.extraSheets) {
    for (const s of t.extraSheets) {
      const ws = wb.addWorksheet(s.name);
      fillSheet(
        ws,
        s.columns,
        s.columns.map((c) => c.example),
        s.examples,
      );
    }
  }

  // README sheet
  const readme = wb.addWorksheet("README");
  fillReadme(readme, t);

  const outPath = join(OUT_DIR, t.file);
  await wb.xlsx.writeFile(outPath);
  console.log("✓", t.file);
}

(async () => {
  for (const t of templates) await generate(t);
  console.log(`\nGenerated ${templates.length} templates in ${OUT_DIR}`);
})();
