import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

const route = read("src/routes/_authenticated/admin.import.tsx");
const panel = read("src/components/admin/ContentImportDryRunPanel.tsx");
const dryRun = read("src/lib/content-import/content-import-dry-run.functions.ts");
const staging = read("src/lib/import/import-staging.functions.ts");
const builder = read("src/components/admin/GoldenLessonPackageBuilder.tsx");
const fileContract = read("src/lib/content-factory/golden-lesson-file-contract.ts");

test("Excel remains limited to structural units and lessons", () => {
  assert.match(route, /allowedTemplateKeys=\{\["units"\]\}/);
  assert.match(route, /allowedTemplateKeys=\{\["lessons"\]\}/);
  assert.doesNotMatch(route, /LESSON_CONTENT_TEMPLATE_KEYS/);
  assert.doesNotMatch(route, /initialTemplateKey="book_contents"/);
  assert.equal((route.match(/requireScope/g) ?? []).length, 2);
  assert.equal((route.match(/scope=\{scope\}/g) ?? []).length, 2);
});

test("content 1-5 is HTML and only items 6-7 are XLSX", () => {
  assert.match(route, /المحتويات 1–5 ملفات HTML/);
  assert.match(route, /أسئلة الكتاب و«اختبر فهمك» فقط بصيغة XLSX/);
  assert.match(route, /<GoldenLessonPackageBuilder\s*\/>/);
  assert.doesNotMatch(route, /رفع محتويات درس واحد يدويًا/);
  assert.match(builder, /09_official_book_questions_template\.xlsx/);
  assert.match(builder, /10_self_test_questions_template\.xlsx/);
  assert.match(builder, /capability === "officialBookContent"[\s\S]*?"\.html,text\/html"/);
  for (const capability of [
    "tamkeenExplanationHtml",
    "lessonSummaryHtml",
    "mindMapHtml",
    "labExperimentHtml",
  ]) {
    assert.match(
      fileContract,
      new RegExp(`${capability}:[\\s\\S]*?extensions: \\["\\.html"`),
    );
  }
});

test("the structural pipeline uses the exact scope property end to end", () => {
  assert.match(panel, /scope\?: ContentImportScope \| null/);
  assert.equal((panel.match(/\.\.\.\(scope \? \{ scope \} : \{\}\)/g) ?? []).length, 2);
  assert.doesNotMatch(panel, /\n\s*scope,\s*\n/);
  assert.doesNotMatch(panel, /curriculumScope/);
  assert.match(panel, /\[resetPipeline, scopeKey\]/);

  for (const source of [dryRun, staging]) {
    assert.match(source, /scope: StructuralImportScopeInput\.optional\(\)/);
    assert.doesNotMatch(source, /curriculumScope/);
  }
});

test("the visible context is grade, tracks, semester and subject", () => {
  assert.equal((route.match(/id="curriculum-import-grade"/g) ?? []).length, 1);
  assert.match(route, /اختر السياق مرة واحدة: الصف ← المسار\/المسارات ← الفصل ← المادة/);
  assert.match(route, /trackCodes\.every/);
  assert.match(route, /type="checkbox"/);
  assert.match(route, /اختر الفصل/);
  assert.match(route, /اختر المادة/);
  assert.match(route, /aria-label="مسار الربط المحدد"/);
});

test("unit remains optional and lesson content is selected inside the fixed context", () => {
  assert.match(route, /unit_code/);
  assert.match(route, /الوحدة الاختيارية والدرس/);
  assert.match(route, /اختياري/);
});
