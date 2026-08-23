import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  applyStructuralImportScopeValidation,
  assertStructuralScopeTemplateKey,
  validateStructuralImportScope,
  type StructuralImportScope,
  type StructuralScopeRegistry,
} from "../../src/lib/content-import/content-import-scope.ts";

const scope: StructuralImportScope = {
  gradeSlug: "grade-12",
  trackCodes: ["sanaa", "aden"],
  semester: 1,
  subjectCode: "sub-g12-001",
};

const registry: StructuralScopeRegistry = {
  grades: [{ gradeSlug: "grade-12" }],
  tracks: [{ trackCode: "sanaa" }, { trackCode: "aden" }],
  subjects: [{
    subjectCode: "sub-g12-001",
    gradeSlug: "grade-12",
    trackCodes: ["sanaa", "aden"],
  }],
};

describe("STRUCTURAL_IMPORT_SCOPE", () => {
  it("wires the fixed scope and registry check into dry-run and prepare", () => {
    const dryRunSource = readFileSync(
      "src/lib/content-import/content-import-dry-run.functions.ts",
      "utf8",
    );
    const prepareSource = readFileSync(
      "src/lib/import/import-staging.functions.ts",
      "utf8",
    );
    for (const source of [dryRunSource, prepareSource]) {
      assert.match(source, /scope: StructuralImportScopeInput\.optional\(\)/);
      assert.match(source, /loadContentCodeRegistry\(supabase\)/);
      assert.match(source, /applyStructuralImportScopeValidation/);
      assert.match(source, /templateKey === "units"|templateKey !== "units"/);
    }
  });

  it("accepts matching units and lessons, including a lesson without a unit", () => {
    for (const templateKey of ["units", "lessons"] as const) {
      const issues = validateStructuralImportScope(
        templateKey,
        {
          rows: [{
            rowNumber: 2,
            data: {
              subject_code: "sub-g12-001",
              semester: "1",
              ...(templateKey === "lessons" ? { unit_code: "" } : {}),
            },
          }],
        },
        scope,
        registry,
      );
      assert.deepEqual(issues, []);
    }
  });

  it("rejects non-structural templates at the server contract", () => {
    assert.throws(
      () => assertStructuralScopeTemplateKey("book_contents"),
      /units\/lessons/,
    );
  });

  it("rejects an unknown subject and grade/track conflicts", () => {
    const unknown = validateStructuralImportScope(
      "units",
      { rows: [] },
      { ...scope, subjectCode: "sub-g12-999" },
      registry,
    );
    assert.ok(unknown.some((issue) => issue.code === "IMPORT_SCOPE_SUBJECT_NOT_FOUND"));

    const conflicts = validateStructuralImportScope(
      "units",
      { rows: [] },
      scope,
      {
        ...registry,
        subjects: [{
          subjectCode: scope.subjectCode,
          gradeSlug: "grade-11",
          trackCodes: ["sanaa"],
        }],
      },
    );
    assert.ok(conflicts.some((issue) => issue.code === "IMPORT_SCOPE_SUBJECT_GRADE_CONFLICT"));
    assert.ok(conflicts.some((issue) => issue.code === "IMPORT_SCOPE_SUBJECT_TRACK_CONFLICT"));
  });

  it("rejects row-level subject and semester mismatches", () => {
    const issues = validateStructuralImportScope(
      "lessons",
      { rows: [{ rowNumber: 7, data: { subject_code: "sub-g12-002", semester: "2" } }] },
      scope,
      registry,
    );
    assert.deepEqual(
      issues.map((issue) => issue.code),
      ["IMPORT_SCOPE_SUBJECT_ROW_CONFLICT", "IMPORT_SCOPE_SEMESTER_ROW_CONFLICT"],
    );
  });

  it("merges scope failures into the dry-run report and invalidates rows", () => {
    const report = applyStructuralImportScopeValidation(
      {
        ok: true,
        status: "pass" as const,
        totalRows: 1,
        validRows: 1,
        errorCount: 0,
        errors: [],
      },
      { rows: [{ rowNumber: 2, data: { subject_code: scope.subjectCode, semester: "" } }] },
      scope,
      registry,
      "units",
    );
    assert.equal(report.ok, false);
    assert.equal(report.status, "fail");
    assert.equal(report.validRows, 0);
    assert.equal(report.errorCount, 1);
  });
});
