import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "content-import", "templates");
mkdirSync(OUT_DIR, { recursive: true });

const COLUMNS = [
  { key: "resource_code", header: "resource_code", width: 22, note: "كود المورد الفريد" },
  { key: "grade_code", header: "grade_code", width: 16, note: "كود الصف" },
  { key: "subject_code", header: "subject_code", width: 20, note: "كود المادة" },
  { key: "unit_code", header: "unit_code", width: 20, note: "كود الوحدة (اختياري)" },
  { key: "lesson_code", header: "lesson_code", width: 22, note: "كود الدرس (إلزامي)" },
  { key: "resource_type", header: "resource_type", width: 26, note: "mind_map_html | practical_experiment_html" },
  { key: "title_ar", header: "title_ar", width: 30, note: "العنوان العربي للمورد" },
  { key: "description_ar", header: "description_ar", width: 35, note: "الوصف العربي للمورد" },
  { key: "alt_text_ar", header: "alt_text_ar", width: 35, note: "النص البديل للوصولية (إلزامي للخرائط)" },
  { key: "package_path", header: "package_path", width: 25, note: "مسار المجلد داخل ZIP" },
  { key: "entry_file", header: "entry_file", width: 18, note: "الملف الرئيسي (افتراضي index.html)" },
  { key: "sort_order", header: "sort_order", width: 14, note: "الترتيب" },
  { key: "version", header: "version", width: 12, note: "الإصدار (عدد صحيح موجب)" },
  { key: "status", header: "status", width: 14, note: "الحالة عند الاستيراد: draft" },
  { key: "offline_enabled", header: "offline_enabled", width: 18, note: "يعمل دون اتصال: true | false" },
  { key: "orientation", header: "orientation", width: 16, note: "auto | portrait | landscape" },
  { key: "height_mode", header: "height_mode", width: 16, note: "fixed | viewport | content" },
  { key: "completion_mode", header: "completion_mode", width: 22, note: "view | interaction_event | manual_review" },
  { key: "completion_event", header: "completion_event", width: 24, note: "experiment_started | step_completed | experiment_completed" },
  { key: "minimum_interaction_seconds", header: "minimum_interaction_seconds", width: 28, note: "الحد الأدنى للتفاعل بالثواني" },
];

const EXAMPLE_ROWS = [
  [
    "MM-G12-BIO-L001",
    "grade-12",
    "bio-g12-aden",
    "unit-bio-01",
    "LES-G12-BIO-001",
    "mind_map_html",
    "الخريطة الذهنية التفاعلية للخلية النباتية",
    "خريطة مفاهيم تفاعلية تدعم التكبير والتكبير لتركيب الخلية النباتية",
    "خريطة ذهنية توضح أجزاء الخلية النباتية مثل الجدار الخلوي والبلاستيدات الخضراء",
    "MM-G12-BIO-L001",
    "index.html",
    1,
    1,
    "draft",
    true,
    "auto",
    "viewport",
    "view",
    "",
    15
  ],
  [
    "EXP-G12-PHY-L004",
    "grade-12",
    "phys-g12-aden",
    "unit-phys-02",
    "LES-G12-PHY-004",
    "practical_experiment_html",
    "تجربة قانون أوم للكهرباء",
    "محاكاة تفاعلية لحساب المقاومة الكهربائية وفرق الجهد",
    "تفاعلية قياس فرق الجهد والتيار في دائرة مغلقة",
    "EXP-G12-PHY-L004",
    "index.html",
    1,
    1,
    "draft",
    true,
    "landscape",
    "viewport",
    "interaction_event",
    "experiment_completed",
    60
  ],
  [
    "EXP-G12-CHEM-L002",
    "grade-12",
    "chem-g12-sanaa",
    "unit-chem-01",
    "LES-G12-CHEM-002",
    "practical_experiment_html",
    "تجربة تفاعل الأحماض مع القواعد (المعايرة)",
    "محاكاة تفاعلية لمعايرة حمض الهيدروكلوريك مع هيدروكسيد الصوديوم",
    "تجربة معايرة كيميائية لقياس نقطة التعادل باستخدام الكاشف",
    "EXP-G12-CHEM-L002",
    "index.html",
    2,
    1,
    "draft",
    true,
    "auto",
    "content",
    "interaction_event",
    "step_completed",
    45
  ],
  [
    "MM-G12-MATH-L003",
    "grade-12",
    "math-g12-aden",
    "", // No unit_code
    "LES-G12-MATH-003",
    "mind_map_html",
    "خريطة تفاضل الدوال المثلثية",
    "خريطة ذهنية شاملة لقوانين مشتقات الدوال المثلثية",
    "خريطة مفاهيم تفاضل الدوال الجيبية والجيب تمام",
    "MM-G12-MATH-L003",
    "index.html",
    3,
    1,
    "draft",
    false,
    "portrait",
    "fixed",
    "view",
    "",
    10
  ],
  [
    "EXP-G12-BIO-L005",
    "grade-12",
    "bio-g12-aden",
    "unit-bio-02",
    "LES-G12-BIO-005",
    "practical_experiment_html",
    "تجربة التنفس الخلوي والتخمر",
    "تجربة محاكاة التخمر الكحولي في الخميرة عند تغيب الأكسجين",
    "محاكاة تفاعلية للتنفس اللاهوائي وإنتاج الغازات",
    "EXP-G12-BIO-L005",
    "index.html",
    1,
    2,
    "draft",
    true, // Offline-enabled
    "landscape",
    "viewport",
    "interaction_event",
    "experiment_completed",
    90
  ]
];

async function generateTemplates() {
  // 1. Template file
  const wbTemplate = new ExcelJS.Workbook();

  // Sheet 1: README_AR
  const sReadme = wbTemplate.addWorksheet("README_AR");
  sReadme.views = [{ rtl: true }];
  sReadme.addRow(["دليل الاستخدام - قالب استيراد الموارد التفاعلية HTML"]);
  sReadme.addRow(["• هذا القالب مخصص لرفع واستيراد الخرائط الذهنية والتجارب العملية بصيغة HTML."]);
  sReadme.addRow(["• يجب ربط كل مورد بـ grade_code و subject_code و lesson_code موجودة مسبقاً في النظام."]);
  sReadme.addRow(["• حقل unit_code اختياري."]);
  sReadme.addRow(["• حقل package_path يجب أن يطابق اسم المجلد داخل ملف ZIP وحقل resource_code."]);
  sReadme.addRow(["• حقل alt_text_ar إلزامي للخرائط الذهنية mind_map_html."]);

  // Sheet 2: INTERACTIVE_RESOURCES
  const sRes = wbTemplate.addWorksheet("INTERACTIVE_RESOURCES");
  sRes.views = [{ rtl: true }];
  sRes.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sRes.getRow(1).font = { bold: true };

  // Sheet 3: ALLOWED_VALUES
  const sVal = wbTemplate.addWorksheet("ALLOWED_VALUES");
  sVal.views = [{ rtl: true }];
  sVal.addRow(["الحقل", "القيم المسموحة"]);
  sVal.addRow(["resource_type", "mind_map_html | practical_experiment_html"]);
  sVal.addRow(["status", "draft (يتم التحويل لـ in_review ثم published)"]);
  sVal.addRow(["offline_enabled", "TRUE | FALSE"]);
  sVal.addRow(["orientation", "auto | portrait | landscape"]);
  sVal.addRow(["height_mode", "fixed | viewport | content"]);
  sVal.addRow(["completion_mode", "view | interaction_event | manual_review"]);
  sVal.addRow(["completion_event", "experiment_started | step_completed | experiment_completed"]);

  // Sheet 4: EXAMPLES
  const sEx = wbTemplate.addWorksheet("EXAMPLES");
  sEx.views = [{ rtl: true }];
  sEx.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sEx.getRow(1).font = { bold: true };
  EXAMPLE_ROWS.forEach((r) => sEx.addRow(r));

  await wbTemplate.xlsx.writeFile(join(OUT_DIR, "interactive_lesson_resources_template.xlsx"));

  // 2. Example file with populated main sheet
  const wbExample = new ExcelJS.Workbook();

  const sExReadme = wbExample.addWorksheet("README_AR");
  sExReadme.views = [{ rtl: true }];
  sExReadme.addRow(["نموذج مكتمل جاهز للاسترشاد - استيراد الموارد التفاعلية HTML"]);

  const sExMain = wbExample.addWorksheet("INTERACTIVE_RESOURCES");
  sExMain.views = [{ rtl: true }];
  sExMain.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sExMain.getRow(1).font = { bold: true };
  EXAMPLE_ROWS.forEach((r) => sExMain.addRow(r));

  const sExVal = wbExample.addWorksheet("ALLOWED_VALUES");
  sExVal.views = [{ rtl: true }];
  sExVal.addRow(["الحقل", "القيم المسموحة"]);
  sExVal.addRow(["resource_type", "mind_map_html | practical_experiment_html"]);
  sExVal.addRow(["status", "draft"]);

  const sExEx = wbExample.addWorksheet("EXAMPLES");
  sExEx.views = [{ rtl: true }];
  sExEx.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sExEx.getRow(1).font = { bold: true };
  EXAMPLE_ROWS.forEach((r) => sExEx.addRow(r));

  await wbExample.xlsx.writeFile(join(OUT_DIR, "interactive_lesson_resources_example.xlsx"));

  console.log("Interactive resource Excel templates generated successfully!");
}

generateTemplates().catch(console.error);
