import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_MINISTERIAL_ROUND_CODE,
  DEFAULT_MINISTERIAL_VARIANT_CODE,
  describeM01OperatorIssues,
  normalizeM01OperatorRows,
} from "../../src/lib/ministerial/ministerial-import-contract.ts";

const ok = (subjectCode: string) => ({
  subject_code: subjectCode,
  track_code: "sanaa",
  academic_year: "2025",
});

test("a bad row does not discard the rows around it", () => {
  const batch = normalizeM01OperatorRows([ok("sub-g12-013"), ok("sub-g11-013"), ok("sub-g12-014")]);

  assert.equal(batch.rows.length, 2);
  assert.deepEqual(
    batch.rows.map((r) => r.subject_code),
    ["sub-g12-013", "sub-g12-014"],
  );
  assert.equal(batch.issues.length, 1);
});

test("every rejected row is reported with its CSV line number", () => {
  const batch = normalizeM01OperatorRows([
    ok("sub-g11-013"),
    ok("sub-g12-013"),
    ok(""),
    ok("SUB-G10-002"),
  ]);

  assert.deepEqual(
    batch.issues.map((i) => i.lineNumber),
    [2, 4, 5],
  );
  assert.deepEqual(
    batch.issues.map((i) => i.value),
    ["sub-g11-013", "فارغ", "SUB-G10-002"],
  );
  for (const issue of batch.issues) {
    assert.equal(issue.code, "MINISTERIAL_GRADE_SCOPE_INVALID");
  }
});

test("generated columns present in an uploaded file are reported as overridden", () => {
  const batch = normalizeM01OperatorRows(
    [{ ...ok("sub-g12-013"), exam_round_code: "r2", model_variant_code: "b" }],
    ["subject_code", "track_code", "academic_year", "EXAM_ROUND_CODE", " model_variant_code "],
  );

  assert.deepEqual(batch.overriddenColumns, ["exam_round_code", "model_variant_code"]);
  assert.equal(batch.rows[0].exam_round_code, DEFAULT_MINISTERIAL_ROUND_CODE);
  assert.equal(batch.rows[0].model_variant_code, DEFAULT_MINISTERIAL_VARIANT_CODE);
});

test("a clean file reports no issues and no overrides", () => {
  const batch = normalizeM01OperatorRows(
    [ok("sub-g12-013")],
    ["subject_code", "track_code", "academic_year"],
  );

  assert.deepEqual(batch.issues, []);
  assert.deepEqual(batch.overriddenColumns, []);
  assert.equal(batch.rows.length, 1);
});

test("the operator summary names each offending line", () => {
  const batch = normalizeM01OperatorRows([ok("sub-g11-013"), ok("sub-g12-013"), ok("sub-g10-001")]);
  const summary = describeM01OperatorIssues(batch.issues);

  assert.match(summary, /2 صف مخالف/);
  assert.match(summary, /2 \(«sub-g11-013»\)/);
  assert.match(summary, /4 \(«sub-g10-001»\)/);
  assert.equal(describeM01OperatorIssues([]), "");
});

test("the summary caps the listed lines instead of growing without bound", () => {
  const rows = Array.from({ length: 30 }, () => ok("sub-g11-013"));
  const summary = describeM01OperatorIssues(normalizeM01OperatorRows(rows).issues, 3);

  assert.match(summary, /30 صف مخالف/);
  assert.match(summary, /و27 سطراً آخر/);
});
