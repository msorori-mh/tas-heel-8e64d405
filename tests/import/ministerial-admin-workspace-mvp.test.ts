import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_MINISTERIAL_ROUND_CODE,
  DEFAULT_MINISTERIAL_VARIANT_CODE,
  MinisterialContractError,
  normalizeM01OperatorRow,
} from "../../src/lib/ministerial/ministerial-import-contract.ts";

test("operator M01 rows are scoped to Grade 12 and receive generated defaults", () => {
  const normalized = normalizeM01OperatorRow({
    subject_code: " SUB-G12-013 ",
    track_code: "sanaa",
    academic_year: "2025",
    model_label: "كيمياء 2025",
  });

  assert.equal(normalized.subject_code, "sub-g12-013");
  assert.equal(normalized.exam_round_code, DEFAULT_MINISTERIAL_ROUND_CODE);
  assert.equal(normalized.model_variant_code, DEFAULT_MINISTERIAL_VARIANT_CODE);
});

test("operator M01 rows fail closed outside Grade 12", () => {
  assert.throws(
    () =>
      normalizeM01OperatorRow({
        subject_code: "sub-g11-013",
        track_code: "sanaa",
        academic_year: "2025",
      }),
    (error: unknown) =>
      error instanceof MinisterialContractError && error.code === "MINISTERIAL_GRADE_SCOPE_INVALID",
  );
});
