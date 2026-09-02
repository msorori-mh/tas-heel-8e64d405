import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync("src/routes/_authenticated/admin.ministerial-exams.tsx", "utf8");
const importer = readFileSync("src/components/admin/MinisterialTrackPackageImporter.tsx", "utf8");
const workbook = readFileSync("src/lib/ministerial/ministerial-package-xlsx.ts", "utf8");

test("ministerial package workspace remains Grade 12 only", () => {
  assert.match(route, /isGrade12Reference/);
  assert.match(route, /subjectsForGrade/);
  assert.match(route, /modelsForGrade12/);
  assert.match(importer, /المادة — الثالث الثانوي/);
  assert.doesNotMatch(route, /<Label>الصف<\/Label>[\s\S]{0,250}<Select/);
});

test("operator uses one track-specific XLSX package instead of exposed M01 and M02 forms", () => {
  assert.match(route, /MinisterialTrackPackageImporter/);
  assert.match(importer, /accept="\.xlsx/);
  assert.match(importer, /مسار صنعاء — اختيار متعدد مثل المفاضلة/);
  assert.match(importer, /مسار عدن — إجابة نصية ومراجعة نموذجية/);
  assert.doesNotMatch(route, /M01_OPERATOR_COLUMNS|M02_COLUMNS|handlePrepareSingleModel/);
});

test("round and variant are generated and publishing stays separate", () => {
  assert.match(workbook, /variantCode\s*=\s*yearGroup\.length === 1 \? "main"/);
  assert.match(importer, /ينشئ التنفيذ مسودات فقط/);
  assert.match(route, /publishMinisterialModel/);
  assert.doesNotMatch(importer, /<Label>الدور<\/Label>|variant.*Input/);
});
