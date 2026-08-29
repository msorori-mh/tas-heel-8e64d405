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
const contentCenterNav = readFileSync("src/components/admin/ContentImportCenterNav.tsx", "utf8");
const directFns = readFileSync("src/lib/content-factory/golden-lesson-direct.functions.ts", "utf8");
const publishFn = readFileSync(
  "src/lib/content-factory/golden-lesson-direct-publish.functions.ts",
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
  // The manual "check files" button is gone: runValidation() already runs on every
  // change to the uploads, so the button recomputed the same result and read as broken.
  assert.doesNotMatch(component, /فحص ومعاينة الملفات/);
  assert.doesNotMatch(
    route,
    /GoldenLessonManifestReviewPanel|GoldenLessonCf11OperatorPanel|BulkLessonPdfUploadPanel/,
  );
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

/**
 * No component is mandatory. Requiring one would mean it is owed before another may go
 * out, which is exactly what per-component publishing removed: a lesson with only a mind
 * map published is a complete lesson that happens to have one component so far.
 */
test("no capability is mandatory in either profile", () => {
  for (const id of ["GOLDEN_QURAN_V1", "GOLDEN_CHEMISTRY_V1"])
    assert.match(profiles, new RegExp(id));
  const required = profiles.match(/: "REQUIRED"/g) ?? [];
  const optional = profiles.match(/: "OPTIONAL"/g) ?? [];
  assert.equal(required.length, 0);
  assert.equal(optional.length, 14, "seven capabilities in each of the two profiles");
  assert.doesNotMatch(profiles, /: "NA"/);
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
  assert.ok(
    controls.length >= 5,
    `expected at least 5 accessible controls, found ${controls.length}`,
  );
  assert.match(component, /grid-cols-1/);
  assert.match(component, /dir="rtl"/);
});

/**
 * A lesson has seven components, not eight. The separate image picker read as a
 * mandatory eighth one, so it is gone: images belong inside the HTML file that
 * references them, and the component then travels as a single unit.
 */
test("there is no separate eighth component for images", () => {
  assert.doesNotMatch(component, /الصور والرسومات المشار إليها/);
  assert.doesNotMatch(component, /ArabicMultiFilePicker/);
  assert.doesNotMatch(component, /golden-supplemental-assets/);
  // Assets extracted from an HTML5/ZIP activity are still declared — that path is
  // internal to one component and never asked the operator for a separate upload.
  assert.match(component, /buildSupplementalAssetDeclarations/);
});

/**
 * Every component has its own publish button. One shared button made publishing an
 * all-or-nothing act in the operator's hands even after the server stopped requiring it.
 */
/**
 * Publishing happens on the component's own row and nowhere else. A page-level "publish
 * the lesson" button turned seven independent outcomes into one shared verdict, so it
 * could sit at the bottom of the page insisting nothing had been published while the rows
 * above correctly reported that components had.
 */
test("publishing happens per component and there is no page-level publish button", () => {
  assert.match(component, /نشر هذا المكوّن/);
  assert.match(component, /publishCapabilityNow\(capability\)/);
  assert.match(component, /const publishCapabilityNow = async \(capability: GoldenCapability\)/);
  assert.match(component, /publishSubset\(\[capability\]\)/);
  assert.doesNotMatch(component, /نشر الدرس الآن/);
  assert.doesNotMatch(component, /importAndPublishNow/);
  assert.doesNotMatch(component, /publishSubset\(null\)/);
  assert.doesNotMatch(component, /إعادة محاولة النشر/);
});

/**
 * A publish that the server refused must fail the call. publishDirectNow reports its
 * outcome and it was being discarded, so a component recorded itself as published while
 * the refusal was rendered further down the page.
 */
/** A retry resumes only the byte-attested current version; history is never a publish source. */
test("only the current exact manifest is resumable", () => {
  assert.match(directFns, /current\.current_manifest_sha256 === manifestSha256/);
  assert.match(directFns, /currentVersion\?\.verified_manifest_sha256 === manifestSha256/);
  assert.match(directFns, /version: current\.current_version/);
  assert.doesNotMatch(directFns, /sameManifestQuery|SameManifestVersionRow|twin\.version/);
  assert.doesNotMatch(directFns, /\.eq\("canonical_manifest_sha256", manifestSha256\)/);
});

/**
 * Every publish traverses the freshly verified current version. Historical materialisation
 * cannot prove what is in the student domain after a later component changed it.
 */
test("a component publishes only through the current verified full chain", () => {
  assert.match(publishFn, /capabilitySha256: z/);
  assert.match(component, /capabilitySha256: uploads\[only\]!\.sha256/);
  assert.doesNotMatch(publishFn, /golden_lesson_publish_component_by_file/);
  assert.doesNotMatch(publishFn, /LCP_NO_PREPARED_BATCH|PREPARED_BATCH_LOOKUP_FAILED/);
  assert.match(publishFn, /selectedEntry\.sourceSha256 !== data\.capabilitySha256/);
  assert.match(publishFn, /COMPONENT_SOURCE_HASH_MISMATCH/);
  assert.match(publishFn, /ensureVerifiedAssets\(batchId\)/);
  assert.match(publishFn, /attestStoredAssets/);
  assert.ok(
    publishFn.indexOf("ensureVerifiedAssets(batchId)") <
      publishFn.indexOf('rpc("golden_lesson_publish_component"'),
    "asset verification must finish before component publication",
  );
});

/** "Published" means the student can see it; nothing weaker may be reported as done. */
test("a publish is only reported as done when the student can see the component", () => {
  assert.equal(
    (publishFn.match(/COMPONENT_PUBLISHED_BUT_NOT_VISIBLE/g) ?? []).length,
    1,
    "the single current-version package chain must assert visibility",
  );
  assert.doesNotMatch(publishFn, /student_can_see_this_component"\]\) === "true"/);
});

/** The removed uniqueness failure is not treated as a normal operator outcome. */
test("the historical-manifest uniqueness workaround is gone from the UI", () => {
  assert.doesNotMatch(component, /golden_lesson_package_version_package_id_canonical_manifest/);
  assert.doesNotMatch(component, /مرفوع ومتحقق منه مسبقًا لهذا المكوّن/);
  assert.match(component, /intakeErrorRef\.current \?\? "DIRECT_INTAKE_FAILED"/);
});

test("a refused publish fails the component that asked for it", () => {
  assert.match(component, /if \(!\(await publishDirectNow\(verified, single\)\)\) \{/);
  assert.match(component, /if \(!\(await publishDirectNow\(resumed, single\)\)\) \{/);
  assert.match(component, /publishErrorRef\.current/);
  assert.match(component, /catch \(error\) \{[\s\S]{0,400}setCapabilityPublishError/);
});

/**
 * A single-component publish must describe only that component. If the manifest still
 * carried the other six files, publishing the mind map would re-publish everything the
 * operator happened to have loaded -- and ship another component's answers with it.
 */
test("a single-component publish carries only that component", () => {
  assert.match(component, /subset === null \|\| subset\.includes\(capability\)/);
  assert.match(component, /buildAnswersCompanion\(answerSets, subset\)/);
  assert.match(component, /asset\.referencedBy\.some\(carries\)/);
  assert.match(component, /buildManifest\(subset, companion\)/);
});

/**
 * Publishing one component must take the single-component server path, not the CF11
 * whole-lesson chain -- that chain demands the mind map, the lab and the book content in
 * every batch, which is what made a one-file publish impossible.
 */
test("a single-component publish takes the single-component server path", () => {
  assert.match(component, /const single = subset && subset\.length === 1 \? subset\[0\] : null/);
  assert.match(component, /publishDirectNow\(verified, single\)/);
  assert.match(component, /publishDirectNow\(resumed, single\)/);
  assert.match(component, /\.\.\.\(only\s*\n?\s*\? \{\s*\n?\s*capability: only,/);
});

test("the server publishes one component without CF11 when a capability is named", () => {
  assert.match(publishFn, /capability: z\n?\s*\.enum\(/);
  assert.match(publishFn, /if \(data\.capability\) \{/);
  assert.match(publishFn, /golden_lesson_publish_component/);
  assert.match(publishFn, /_capability: data\.capability/);
  // The whole-lesson chain stays available for a full publish.
  assert.match(publishFn, /golden_lesson_publish_cf11/);
  assert.ok(
    publishFn.indexOf("golden_lesson_publish_component") <
      publishFn.indexOf('rpc("golden_lesson_publish_cf11"'),
    "the single-component branch must return before the CF11 chain runs",
  );
});

/** Per-component publishing needs per-component feedback, not one shared banner. */
test("publish state is tracked per component", () => {
  assert.match(component, /capabilityPublishBusy/);
  assert.match(component, /capabilityPublishError/);
  assert.match(component, /capabilityPublished/);
  assert.match(component, /نُشر هذا المكوّن في/);
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
  assert.match(textbookManager, /لا\s+يشترط وجود كتاب مسبقًا/);
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
