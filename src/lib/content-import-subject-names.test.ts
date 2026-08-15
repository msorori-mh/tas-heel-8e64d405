import assert from "node:assert/strict";
import test from "node:test";
import { validateContentImportSheet } from "./content-import/content-import-validators.ts";
import type { ContentImportParsedSheet } from "./content-import/content-import-types.ts";

const SUBJECT_COLUMNS = [
  "subject_code",
  "name",
  "grade_slug",
  "track_codes",
  "semester",
  "icon",
  "color",
  "sort_order",
];

function sheet(rows: Array<Record<string, string>>): ContentImportParsedSheet {
  return {
    detectedColumns: SUBJECT_COLUMNS,
    fileName: "01_subjects_template.xlsx",
    rows: rows.map((data, i) => ({ rowNumber: i + 2, data })),
  };
}

function subjectRow(code: string, name: string, sort_order = "1"): Record<string, string> {
  return {
    subject_code: code,
    name,
    grade_slug: "grade-10",
    track_codes: "sanaa|aden",
    semester: "1",
    icon: "BookOpen",
    color: "#27ae60",
    sort_order,
  };
}

const warningCodes = (report: ReturnType<typeof validateContentImportSheet>) =>
  report.warnings.map((w) => w.code);

// INFO diagnostics (e.g. "slug is derived from subject_code") are guidance, not
// findings: they never block an import, so name-format tests ignore them.
const blockingCodes = (report: ReturnType<typeof validateContentImportSheet>) =>
  warningCodes(report).filter((code) => code !== "INFO");
const isCleanRun = (report: ReturnType<typeof validateContentImportSheet>) =>
  report.errorCount === 0 && blockingCodes(report).length === 0;

test("dry-run accepts the approved grouped name format", () => {
  const report = validateContentImportSheet(
    "subjects",
    sheet([
      subjectRow("islam-g10-quran", "التربية الإسلامية - القرآن الكريم وعلومه", "1"),
      subjectRow("islam-g10-sira", "التربية الإسلامية - السيرة النبوية", "2"),
      subjectRow("arabic-g10-nahw", "اللغة العربية - النحو والصرف", "4"),
    ]),
  );
  assert.equal(report.status, "pass", JSON.stringify(report.warnings));
  assert.equal(report.errorCount, 0);
  assert.deepEqual(warningCodes(report), []);
});

test("dry-run warns on the non-approved «الإسلامية - ...» spelling", () => {
  const report = validateContentImportSheet(
    "subjects",
    sheet([subjectRow("islam-g10-sira", "الإسلامية - السيرة النبوية")]),
  );
  assert.ok(warningCodes(report).includes("NONSTANDARD_PARENT_SPELLING"));
  assert.equal(report.status, "warn", "warning must not block the dry-run");
  assert.equal(report.ok, true);
});

test("dry-run warns on non-unified separators", () => {
  for (const dash of ["–", "—", "−", "‐", "―"]) {
    const report = validateContentImportSheet(
      "subjects",
      sheet([subjectRow("soc-g10-hist", `الاجتماعيات ${dash} التاريخ`)]),
    );
    assert.ok(
      warningCodes(report).includes("NONSTANDARD_SEPARATOR"),
      `dash ${dash} must warn`,
    );
    assert.equal(report.ok, true);
  }
});

test("dry-run warns on mismatched parent spellings of the same family", () => {
  const report = validateContentImportSheet(
    "subjects",
    sheet([
      subjectRow("a", "الإسلامية - القرآن الكريم وعلومه", "1"),
      subjectRow("b", "التربية الإسلامية - السيرة النبوية", "2"),
    ]),
  );
  assert.ok(warningCodes(report).includes("PARENT_SPELLING_MISMATCH"));
  assert.equal(report.ok, true);
});

test("dry-run does not break an ordinary subject without a separator", () => {
  const report = validateContentImportSheet(
    "subjects",
    sheet([subjectRow("math-g10", "الرياضيات", "9")]),
  );
  assert.equal(report.status, "pass", JSON.stringify(report.warnings));
  assert.deepEqual(warningCodes(report), []);
});

test("subjects template accepts sort_order/color/icon columns", () => {
  const report = validateContentImportSheet(
    "subjects",
    sheet([subjectRow("phys-g10", "الفيزياء", "10")]),
  );
  assert.equal(report.errorCount, 0);
  assert.ok(report.detectedColumns.includes("sort_order"));
  assert.ok(report.detectedColumns.includes("color"));
  assert.ok(report.detectedColumns.includes("icon"));
});
