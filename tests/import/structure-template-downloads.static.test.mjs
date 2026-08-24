import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync(
  "src/components/admin/ContentImportDryRunPanel.tsx",
  "utf8",
);
const functions = fs.readFileSync(
  "src/lib/content-codes/content-codes.functions.ts",
  "utf8",
);
const generator = fs.readFileSync(
  "src/lib/content-codes/contextual-template.server.ts",
  "utf8",
);

test("units and lessons cards expose explicit contextual XLSX downloads", () => {
  assert.match(panel, /تنزيل نموذج الوحدات/);
  assert.match(panel, /تنزيل نموذج الدروس/);
  assert.match(panel, /downloadContextualTemplate/);
  assert.match(panel, /disabled=\{!scopeComplete/);
  assert.match(panel, /templateKey === "units" \? 20 : 50/);
});

test("downloaded templates are bound to grade tracks semester and official subject", () => {
  assert.match(panel, /gradeSlug: templateScope\.gradeSlug/);
  assert.match(panel, /trackCodes: templateScope\.trackCodes/);
  assert.match(panel, /semester: templateScope\.semester/);
  assert.match(panel, /subjectCode: templateScope\.subjectCode/);
  assert.match(functions, /semester: z\.union\(\[z\.literal\(1\), z\.literal\(2\)\]\)\.optional\(\)/);
});

test("generator prefills semester without changing canonical template columns", () => {
  assert.match(generator, /\.\.\.\(semester \? \{ semester: String\(semester\) \} : \{\}\)/);
  assert.match(generator, /templateColumnsForEntity\(input\.templateKey\)/);
  assert.match(generator, /prefilledColumns/);
  assert.match(generator, /workbook\.xlsx\.writeBuffer\(\)/);
});
