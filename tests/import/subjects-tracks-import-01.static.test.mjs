import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("src/routes/_authenticated/admin.import.tsx", "utf8");
const subjectPanel = fs.readFileSync("src/components/admin/SubjectImportPanel.tsx", "utf8");
const importPanel = fs.readFileSync("src/components/admin/ContentImportDryRunPanel.tsx", "utf8");
const scopeContract = fs.readFileSync("src/lib/import/curriculum-import-scope.ts", "utf8");
const scopeServer = fs.readFileSync("src/lib/import/curriculum-import-scope.server.ts", "utf8");
const dryRun = fs.readFileSync("src/lib/content-import/content-import-dry-run.functions.ts", "utf8");
const staging = fs.readFileSync("src/lib/import/import-staging.functions.ts", "utf8");
const contract = fs.readFileSync("src/lib/import/import-contract.ts", "utf8");
const planner = fs.readFileSync("src/lib/content-codes/subject-template-plan.ts", "utf8");
const generator = fs.readFileSync("src/lib/content-codes/contextual-template.server.ts", "utf8");

test("template 01 is the first step in the unified content import route", () => {
  assert.match(route, /SubjectImportPanel/);
  assert.match(route, /number: 1, label: "المواد والمسارات"/);
  assert.match(route, /ابدأ من هنا بتعريف المواد وربطها بالصف والمسارات/);
});

test("operator selects one official grade and one or more active tracks", () => {
  assert.match(subjectPanel, /select\("id, name, slug, sort_order"\)/);
  assert.match(subjectPanel, /\.in\("track_code", \["sanaa", "aden"\]\)/);
  assert.match(subjectPanel, /\.eq\("is_active", true\)/);
  assert.match(subjectPanel, /allowedTemplateKeys=\{\["subjects"\]\}/);
  assert.match(subjectPanel, /للمادة المشتركة اختر صنعاء وعدن معًا/);
});

test("template 01 download is system-generated and disabled until scope is complete", () => {
  assert.match(importPanel, /isCompleteSubjectImportScope\(curriculumScope\)/);
  assert.match(importPanel, /templateKey === "subjects"/);
  assert.match(importPanel, /rowCount: 20/);
  assert.match(importPanel, /تنزيل نموذج المواد/);
  assert.match(importPanel, /disabled=\{!scopeComplete/);
});

test("subject scope is authoritative during dry-run prepare and execute", () => {
  assert.match(scopeContract, /export interface SubjectImportScope/);
  assert.match(scopeServer, /resolveSubjectImportScope/);
  assert.match(scopeServer, /applySubjectImportScopeToRows/);
  assert.match(scopeServer, /grade_slug: scope\.gradeSlug/);
  assert.match(scopeServer, /track_codes: scope\.trackCodes\.join\("\|"\)/);
  assert.match(dryRun, /GRADE_OVERRIDDEN_BY_SCOPE/);
  assert.match(dryRun, /TRACKS_OVERRIDDEN_BY_SCOPE/);
  assert.match(staging, /templateKey === "subjects"/);
  assert.match(staging, /applySubjectImportScopeToRows/);
  assert.match(staging, /IMPORT_SCOPE_CHANGED_AFTER_PREPARE/);
});

test("server rejects a subject import carrying a unit or lesson scope", () => {
  assert.match(staging, /templateKeys\.includes\("subjects"\) && "subjectCode" in data\.curriculumScope/);
  assert.match(staging, /IMPORT_SUBJECT_SCOPE_INVALID/);
});

test("subject codes grade tracks and order are generated while semester is not an operator field", () => {
  assert.match(planner, /sort_order: subjectSortOrder\(/);
  assert.match(planner, /parseTcs2Code\(code\)/);
  assert.match(planner, /"subject_code",\s*"grade_slug",\s*"track_codes"/);
  assert.match(planner, /"sort_order"/);
  assert.match(contract, /field: "semester",[\s\S]*?table: "subjects",[\s\S]*?templateField: false/);
  assert.doesNotMatch(
    contract,
    /subjects: \["subject_code", "name", "grade_slug", "track_codes", "semester"/,
  );
});

test("generated workbook opens on populated data before instructions", () => {
  const dataIndex = generator.indexOf('workbook.addWorksheet("البيانات"');
  const instructionsIndex = generator.indexOf('workbook.addWorksheet("تعليمات"');
  assert.ok(dataIndex >= 0 && instructionsIndex > dataIndex);
  assert.match(generator, /المادة لا تُقسّم حسب الفصل الدراسي/);
  assert.match(generator, /fgColor: \{ argb: "FFE8EEF7" \}/);
});
