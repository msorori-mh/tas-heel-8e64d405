import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const component = readFileSync("src/components/admin/GoldenLessonPackageBuilder.tsx", "utf8");
const route = readFileSync("src/routes/_authenticated/admin.import.tsx", "utf8");
const profiles = readFileSync("src/lib/content-factory/golden-lesson-profiles.ts", "utf8");
const xlsx = readFileSync("src/lib/content-factory/golden-lesson-xlsx.ts", "utf8");
const unitDialog = readFileSync("src/components/admin/UnitEditDialog.tsx", "utf8");
const unitFunctions = readFileSync("src/lib/content-codes/content-codes.functions.ts", "utf8");
const textbookManager = readFileSync("src/components/admin/SubjectTextbooksManager.tsx", "utf8");
const adminLayout = readFileSync("src/components/admin/AdminLayout.tsx", "utf8");
const contentCenterNav = readFileSync(
  "src/components/admin/ContentImportCenterNav.tsx",
  "utf8",
);

test("the import center exposes the unified curriculum and lesson-content workflow", () => {
  assert.match(route, /الاستيراد والفحص والنشر/);
  assert.match(route, /ContentImportDryRunPanel/);
  assert.match(route, /allowedTemplateKeys=\{\["units"\]\}/);
  assert.match(route, /allowedTemplateKeys=\{\["lessons"\]\}/);
  assert.match(route, /الوحدات أو الفصول — اختياري/);
  assert.match(route, /unit_code/);
  assert.match(route, /<GoldenLessonPackageBuilder\s*\/>/);
  assert.match(component, /GOLDEN_CAPABILITIES/);
  assert.match(component, /1\. اختيار الدرس/);
  assert.match(component, /فحص ومعاينة الملفات/);
  assert.match(component, /نشر الدرس الآن/);
  assert.doesNotMatch(route, /GoldenLessonManifestReviewPanel|GoldenLessonCf11OperatorPanel|BulkLessonPdfUploadPanel/);
  assert.match(component, /09_official_book_questions_template\.xlsx/);
  assert.match(component, /10_self_test_questions_template\.xlsx/);
  assert.match(component, /getContentCodeRegistry/);
  assert.match(component, /lesson-import-grade/);
  assert.match(component, /lesson-import-lesson/);
  assert.doesNotMatch(component, /رمز عملية الاستيراد|رمز الصف|رمز الدرس|رابط الدرس/);
  assert.doesNotMatch(route, /operator-pack|حزمة المشغّل/);
});

test("operators upload seven declared items and never upload a lesson ZIP or provenance file", () => {
  assert.match(component, /استيراد محتويات الدرس السبعة/);
  assert.match(component, /لا يوجد ملف ZIP للدرس/);
  assert.doesNotMatch(component, /تنزيل حزمة ZIP|رفع الحزمة والتحقق|ملف توثيق المصدر الرسمي/);
  assert.doesNotMatch(component, /handleProvenanceFile|handleAnswersFile/);
  assert.doesNotMatch(component, /JSZip|buildInternalIntakeBlob|createGoldenLessonBundleUpload/);
  assert.match(component, /createGoldenLessonDirectUpload/);
  assert.match(component, /uploadToSignedUrl\(upload\.storagePath/);
  assert.match(component, /CAPABILITY_NUMBER/);
});

test("exactly six capabilities are required and only the lab is optional", () => {
  for (const id of ["GOLDEN_QURAN_V1", "GOLDEN_CHEMISTRY_V1"]) assert.match(profiles, new RegExp(id));
  const required = profiles.match(/: "REQUIRED"/g) ?? [];
  const optional = profiles.match(/: "OPTIONAL"/g) ?? [];
  assert.equal(required.length, 12);
  assert.equal(optional.length, 2);
  assert.equal((profiles.match(/labExperimentHtml: "OPTIONAL"/g) ?? []).length, 2);
  assert.equal((profiles.match(/officialBookQuestions: "REQUIRED"/g) ?? []).length, 2);
  assert.doesNotMatch(profiles, /mindMapHtml: "OPTIONAL"|officialBookQuestions: "OPTIONAL"|selfTest: "OPTIONAL"|labExperimentHtml: "NA"/);
});

test("question XLSX files are split automatically into public and server-only layers", () => {
  assert.match(component, /convertQuestionWorkbook/);
  assert.match(component, /SERVER_CONTROLLED_REVEAL_ONLY/);
  assert.match(component, /publicPayloadContainsAnswers: false/);
  assert.match(xlsx, /model_answer/);
  assert.match(xlsx, /why_wrong_/);
  assert.match(xlsx, /correct_option/);
  assert.doesNotMatch(component, /id="golden-answers-companion"/);
});

test("the optional activity has its own HTML or HTML5 ZIP picker", () => {
  assert.match(component, /capability === "labExperimentHtml"/);
  assert.match(component, /\.html,\.zip,text\/html,application\/zip/);
  assert.match(component, /convertHtml5ActivityZip/);
});

test("student visibility remains fail-closed", () => {
  assert.match(component, /initialStatus: "DRAFT"/);
  assert.match(component, /allowDirectReady: false/);
  assert.match(component, /productionApply: false/);
  assert.match(component, /htmlNetworkAccess: "NONE"/);
});

test("mobile-first controls meet the 44px target", () => {
  const controls = component.match(/min-h-\[44px\]/g) ?? [];
  assert.ok(controls.length >= 5, `expected at least 5 accessible controls, found ${controls.length}`);
  assert.match(component, /grid-cols-1/);
  assert.match(component, /dir="rtl"/);
});

test("supplemental picker snapshots the live FileList before clearing", () => {
  assert.match(component, /const files = Array\.from\(event\.currentTarget\.files \?\? \[\]\)/);
  assert.match(component, /event\.currentTarget\.value = "";\s*void onFiles\(files\)/);
});

test("partial lesson drafts are autosaved and restored without server publication", () => {
  assert.match(component, /indexedDB\.open\(LOCAL_DRAFT_DB/);
  assert.match(component, /writeLocalLessonDraft/);
  assert.match(component, /readLocalLessonDraft/);
  assert.match(component, /تم حفظ المسودة تلقائيًا/);
  assert.match(component, /removeLocalLessonDraft/);
});

test("curriculum prerequisites are explicit and use only the two operational tracks", () => {
  assert.match(component, /المسار \(اختيار متعدد\)/);
  assert.match(component, /lesson-import-track-\$\{track\.trackCode\}/);
  assert.match(component, /track\.trackCode === "sanaa" \|\| track\.trackCode === "aden"/);
  assert.match(component, /selectedTrackCodes\.every/);
  assert.doesNotMatch(component, /href="\/admin\/units"/);
  assert.doesNotMatch(component, /href="\/admin\/textbooks"/);
  assert.match(component, /لا توجد وحدة — الدرس مرتبط بالمادة مباشرة/);
  assert.match(textbookManager, /لا يشترط وجود كتاب مسبقًا/);
  assert.match(textbookManager, /id="subject-textbook-pdf"/);
  assert.match(textbookManager, /منهج صنعاء وعدن معًا/);
  assert.match(adminLayout, /استيراد المحتوى/);
  assert.doesNotMatch(adminLayout, /رفع كتب المواد|استيراد محتوى الدروس/);
  assert.match(contentCenterNav, /كتب المواد/);
  assert.match(contentCenterNav, /هيكل المنهج/);
  assert.match(contentCenterNav, /المواد والمسارات/);
  assert.match(contentCenterNav, /الوحدات/);
  assert.match(contentCenterNav, /الدروس/);
  assert.match(contentCenterNav, /الاستيراد والنشر/);
});

test("manual unit entry allocates a server-owned TCS-2 code", () => {
  assert.match(unitDialog, /useServerFn\(createCurriculumUnitAdmin\)/);
  assert.match(unitDialog, /ينشئ النظام كود TCS-2 تلقائيًا/);
  assert.doesNotMatch(unitDialog, /from\("units"\)\.insert/);
  assert.match(unitFunctions, /parseTcs2Code/);
  assert.match(unitFunctions, /nextAllocatedNumber\(existingCodes, "unit"/);
  assert.match(unitFunctions, /buildUnitCode/);
  assert.match(unitFunctions, /\.insert\(\{\s*code,/);
});
