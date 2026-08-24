import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("src/routes/_authenticated/admin.import.tsx", "utf8");
const panel = fs.readFileSync("src/components/admin/ContentImportDryRunPanel.tsx", "utf8");
const form = fs.readFileSync("src/components/admin/CurriculumImportScopeForm.tsx", "utf8");
const dryRun = fs.readFileSync(
  "src/lib/content-import/content-import-dry-run.functions.ts",
  "utf8",
);
const staging = fs.readFileSync("src/lib/import/import-staging.functions.ts", "utf8");
const resolver = fs.readFileSync(
  "src/lib/import/curriculum-import-scope.server.ts",
  "utf8",
);

test("units and lessons share one mandatory fixed curriculum scope", () => {
  assert.match(route, /CurriculumImportScopeForm/);
  assert.equal((route.match(/curriculumScope=\{structureScope\}/g) ?? []).length, 2);
  assert.match(form, /الصف/);
  assert.match(form, /المسار \(اختيار متعدد\)/);
  assert.match(form, /الفصل الدراسي/);
  assert.match(form, /المادة/);
});

test("scope change clears workbook and every prepared pipeline token", () => {
  assert.match(panel, /curriculumImportScopeKey\(curriculumScope\)/);
  assert.match(panel, /inputRef\.current\.value = ""/);
  assert.match(panel, /setJobId\(null\)/);
  assert.match(panel, /setPreparedHash\(null\)/);
  assert.match(panel, /disabled=\{!scopeComplete/);
});

test("the selected official subject is authoritative in dry-run and staging", () => {
  assert.match(dryRun, /SUBJECT_CODE_OVERRIDDEN_BY_SCOPE/);
  assert.match(dryRun, /subject_code: resolved\.subjectCode/);
  assert.match(staging, /applyCurriculumImportScopeToRows/);
  assert.match(resolver, /subject_code: scope\.subjectCode/);
  assert.match(resolver, /semester: String\(scope\.semester\)/);
});

test("server rejects missing, wrong-grade, and wrong-track scopes fail closed", () => {
  assert.match(resolver, /IMPORT_SCOPE_REQUIRED/);
  assert.match(resolver, /candidate\.gradeSlug\.toLowerCase\(\) === gradeSlug/);
  assert.match(resolver, /IMPORT_SCOPE_SUBJECT_NOT_FOUND/);
  assert.match(resolver, /IMPORT_SCOPE_TRACK_MISMATCH/);
  assert.match(staging, /IMPORT_SCOPE_CHANGED_AFTER_PREPARE/);
});

test("unit_code remains optional for lessons attached directly to a subject", () => {
  const contract = fs.readFileSync("src/lib/import/import-contract.ts", "utf8");
  assert.match(
    contract,
    /f\("unit_code", "units", null, false, "lookup \(subject_id, units\.code\).*empty = lesson attached directly to subject"\)/,
  );
});

test("non-empty unit_code fails closed when the unit is absent from selected subject", () => {
  assert.match(staging, /requestedUnitCodes/);
  assert.match(staging, /\.eq\("subject_id", resolvedScope\.subjectId\)/);
  assert.match(staging, /UNIT_NOT_FOUND_IN_SCOPE/);
  assert.match(staging, /stagedRows: 0/);
});
