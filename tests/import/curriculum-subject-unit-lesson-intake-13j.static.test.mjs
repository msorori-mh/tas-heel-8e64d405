import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = {
  lessonDialog: "src/components/admin/LessonCreateDialog.tsx",
  unitDialog: "src/components/admin/UnitEditDialog.tsx",
  subjectDialog: "src/components/admin/SubjectEditDialog.tsx",
  lessonsPage: "src/routes/_authenticated/admin.lessons.index.tsx",
  unitsPage: "src/routes/_authenticated/admin.units.tsx",
  serverFunctions: "src/lib/content-codes/content-codes.functions.ts",
  importContract: "src/lib/import/import-contract.ts",
  migration: "supabase/migrations/20260826010000_curriculum_subject_unit_lesson_intake_fix_13j.sql",
};

const read = (key) => readFileSync(files[key], "utf8");

describe("CURRICULUM_SUBJECT_UNIT_LESSON_INTAKE_FIX_13J", () => {
  it("requires an explicit grade when a subject is created", () => {
    const source = read("subjectDialog");
    assert.ok(source.includes('setGradeId("")'));
    assert.ok(source.includes("الصف مطلوب ويجب اختياره من القائمة"));
    assert.ok(!source.includes('setGradeId(grades[0]?.id ?? "")'));
  });

  it("keeps unit_code optional for lessons but required for unit rows", () => {
    const contract = read("importContract");
    assert.match(contract, /f\("unit_code", "units", "code", true\)/);
    assert.match(
      contract,
      /f\(\s*"unit_code",\s*"units",\s*null,\s*false,\s*"[^"]*empty = lesson attached directly to subject"/,
    );
  });

  it("supports direct-to-subject lesson creation and server-owned TCS-2 codes", () => {
    const dialog = read("lessonDialog");
    const server = read("serverFunctions");
    assert.ok(dialog.includes("لا توجد وحدة — ربط الدرس بالمادة مباشرة"));
    assert.ok(dialog.includes("unitId: unitId || null"));
    assert.ok(server.includes("createCurriculumLessonAdmin"));
    assert.ok(server.includes("buildLessonCode"));
    assert.ok(server.includes("unit_id: unitId"));
    assert.ok(!dialog.includes("اختيار الوحدة مطلوب"));
  });

  it("cascades grade to subject in unit and lesson entry", () => {
    const lesson = read("lessonDialog");
    const unit = read("unitDialog");
    assert.ok(lesson.includes("filteredSubjects"));
    assert.ok(lesson.includes('setSubjectId("")'));
    assert.ok(unit.includes("filteredSubjects"));
    assert.ok(unit.includes('setSelectedSubjectId("")'));
  });

  it("filters direct lessons and never broadens an empty grade result", () => {
    const lessons = read("lessonsPage");
    const units = read("unitsPage");
    assert.ok(lessons.includes('unitFilter === "__NO_UNIT__"'));
    assert.ok(lessons.includes('q.is("unit_id", null)'));
    assert.ok(lessons.includes("gradeSubjectIds.length === 0"));
    assert.ok(units.includes("gradeSubjectIds.length === 0"));
  });

  it("fails closed on grade and unit references during import", () => {
    const sql = read("migration");
    assert.ok(sql.includes("GRADE_NOT_FOUND"));
    assert.ok(sql.includes("SUBJECT_GRADE_MISMATCH"));
    assert.ok(sql.includes("UNIT_CODE_REQUIRED"));
    assert.ok(sql.includes("UNIT_NOT_FOUND_FOR_SUBJECT"));
    assert.ok(sql.includes("unit_id = unit"));
    assert.ok(!sql.includes("unit_id = COALESCE(unit, unit_id)"));
  });
});
