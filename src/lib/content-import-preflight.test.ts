import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import { validateContentPackage } from "../../scripts/content-import/validate-content-package.mjs";

type Row = (string | number)[];

async function writeXlsx(path: string, headers: string[], rows: Row[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("data");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  await wb.xlsx.writeFile(path);
}

/** Minimal valid 10-file package; pass overrides per template key. */
async function makePackage(
  overrides: Partial<Record<string, { headers: string[]; rows: Row[] }>> = {},
  omit: string[] = [],
): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "preflight-"));
  const files: Record<string, { headers: string[]; rows: Row[] }> = {
    "01_subjects_template.xlsx": {
      headers: ["subject_code", "name", "grade_slug", "color", "icon", "sort_order"],
      rows: [
        ["islam-g10-sira", "التربية الإسلامية - السيرة النبوية", "grade-10", "#27ae60", "BookOpen", 2],
        ["math-g10", "الرياضيات", "grade-10", "#111111", "BookOpen", 9],
      ],
    },
    "02_units_template.xlsx": {
      headers: ["unit_code", "subject_code", "title"],
      rows: [["islam-g10-u1", "islam-g10-sira", "الوحدة الأولى"]],
    },
    "03_lessons_template.xlsx": {
      headers: ["lesson_code", "subject_code", "unit_code", "title"],
      rows: [["islam-g10-u1-l1", "islam-g10-sira", "islam-g10-u1", "الدرس الأول"]],
    },
    "04_lesson_book_contents_template.xlsx": {
      headers: ["lesson_code", "content"],
      rows: [["islam-g10-u1-l1", "نص الدرس"]],
    },
    "05_lesson_explanations_template.xlsx": {
      headers: ["lesson_code", "title", "content"],
      rows: [["islam-g10-u1-l1", "شرح", "تفاصيل"]],
    },
    "06_lesson_resources_template.xlsx": {
      headers: ["lesson_code", "resource_type", "title"],
      rows: [["islam-g10-u1-l1", "video", "فيديو الدرس"]],
    },
    "07_lesson_assessments_template.xlsx": {
      headers: ["assessment_code", "lesson_code", "title"],
      rows: [["islam-g10-u1-l1-a1", "islam-g10-u1-l1", "تقييم قصير"]],
    },
    "08_assessment_questions_template.xlsx": {
      headers: ["assessment_code", "question_code"],
      rows: [["islam-g10-u1-l1-a1", "islam-g10-q1"]],
    },
    "09_official_book_questions_template.xlsx": {
      headers: [
        "question_code",
        "subject_code",
        "lesson_code",
        "prompt_kind",
        "question_text",
        "interaction_type",
        "grading_mode",
        "model_answer",
      ],
      rows: [[
        "islam-g10-book-q1",
        "islam-g10-sira",
        "islam-g10-u1-l1",
        "تعليل",
        "علل ما سبق.",
        "LONG_TEXT",
        "MANUAL",
        "الإجابة النموذجية.",
      ]],
    },
    "10_self_test_questions_template.xlsx": {
      headers: [
        "question_code",
        "subject_code",
        "lesson_code",
        "question_text",
        "option_1",
        "option_2",
        "correct_index",
        "explanation",
      ],
      rows: [[
        "islam-g10-q1",
        "islam-g10-sira",
        "islam-g10-u1-l1",
        "اختر الإجابة الصحيحة.",
        "أ",
        "ب",
        1,
        "الخيار الأول هو الصحيح.",
      ]],
    },
    ...overrides,
  };
  for (const [name, def] of Object.entries(files)) {
    const key = name.slice(0, 2);
    if (omit.includes(name) || omit.includes(key)) continue;
    await writeXlsx(join(dir, name), def.headers, def.rows);
  }
  return dir;
}

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

test("missing template file produces a clear blocking error", async () => {
  const dir = await makePackage({}, ["04_lesson_book_contents_template.xlsx"]);
  try {
    const report = await validateContentPackage(dir);
    assert.equal(report.ok, false);
    assert.ok(codes(report.errors).includes("FILE_MISSING"));
    assert.ok(report.missing.includes("04_lesson_book_contents_template.xlsx"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("approved grouped subject names pass with no naming warnings", async () => {
  const dir = await makePackage();
  try {
    const report = await validateContentPackage(dir);
    assert.equal(report.ok, true, JSON.stringify(report.errors));
    const naming = codes(report.warnings).filter((c) => c.startsWith("NONSTANDARD") || c === "PARENT_SPELLING_MISMATCH");
    assert.deepEqual(naming, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("non-unified separators produce a warning", async () => {
  const dir = await makePackage({
    "01_subjects_template.xlsx": {
      headers: ["subject_code", "name", "grade_slug"],
      rows: [
        ["islam-g10-sira", "التربية الإسلامية - السيرة النبوية", "grade-10"],
        ["soc-g10-hist", "الاجتماعيات — التاريخ", "grade-10"],
      ],
    },
  });
  try {
    const report = await validateContentPackage(dir);
    assert.ok(codes(report.warnings).includes("NONSTANDARD_SEPARATOR"));
    assert.equal(report.ok, true, "warning must not block");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("«الإسلامية - ...» spelling produces a warning suggesting the approved form", async () => {
  const dir = await makePackage({
    "01_subjects_template.xlsx": {
      headers: ["subject_code", "name", "grade_slug"],
      rows: [["islam-g10-sira", "الإسلامية - السيرة النبوية", "grade-10"]],
    },
  });
  try {
    const report = await validateContentPackage(dir);
    assert.ok(codes(report.warnings).includes("NONSTANDARD_PARENT_SPELLING"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("duplicate code produces a blocking error", async () => {
  const dir = await makePackage({
    "02_units_template.xlsx": {
      headers: ["unit_code", "subject_code", "title"],
      rows: [
        ["islam-g10-u1", "islam-g10-sira", "الوحدة الأولى"],
        ["islam-g10-u1", "islam-g10-sira", "تكرار"],
      ],
    },
  });
  try {
    const report = await validateContentPackage(dir);
    assert.equal(report.ok, false);
    assert.ok(codes(report.errors).includes("DUPLICATE_CODE"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown cross-file reference produces a blocking error", async () => {
  const dir = await makePackage({
    "02_units_template.xlsx": {
      headers: ["unit_code", "subject_code", "title"],
      rows: [["x-u1", "no-such-subject", "وحدة يتيمة"]],
    },
  });
  try {
    const report = await validateContentPackage(dir);
    assert.equal(report.ok, false);
    assert.ok(codes(report.errors).includes("UNKNOWN_REFERENCE"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ordinary subject without separator is not broken", async () => {
  const dir = await makePackage();
  try {
    const report = await validateContentPackage(dir);
    assert.equal(report.ok, true, JSON.stringify(report.errors, null, 1));
    assert.equal(report.found.length, 10);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
