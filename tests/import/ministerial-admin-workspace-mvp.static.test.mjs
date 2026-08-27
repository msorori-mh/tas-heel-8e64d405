import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync("src/routes/_authenticated/admin.ministerial-exams.tsx", "utf8");
const contract = readFileSync("src/lib/ministerial/ministerial-import-contract.ts", "utf8");

test("ministerial admin workspace is Grade 12 only", () => {
  assert.match(route, /الثالث الثانوي فقط/);
  assert.match(route, /isGrade12Reference/);
  assert.match(route, /modelsForGrade12/);
  assert.doesNotMatch(route, /<Label>الصف<\/Label>[\s\S]{0,250}<Select/);
});

test("round and variant are generated internally, never typed by staff", () => {
  assert.match(contract, /DEFAULT_MINISTERIAL_ROUND_CODE = "r1"/);
  assert.match(contract, /DEFAULT_MINISTERIAL_VARIANT_CODE = "main"/);
  assert.match(route, /normalizeM01OperatorRow/);
  assert.doesNotMatch(route, /<Label>الدور<\/Label>/);
  assert.doesNotMatch(route, /<Label>رمز النموذج \(variant\)<\/Label>/);
});

test("single and bulk import paths are explicit and functional", () => {
  assert.match(route, /إضافة نموذج جديد/);
  assert.match(route, /الاستيراد المتعدد/);
  assert.match(route, /handlePrepareSingleModel/);
  assert.match(route, /type="file"/);
  assert.match(route, /M01_OPERATOR_COLUMNS/);
});
