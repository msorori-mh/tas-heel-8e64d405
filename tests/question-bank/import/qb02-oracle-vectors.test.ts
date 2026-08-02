import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  compareNormalized,
  executeOracleVector,
  type OracleVector,
  type VectorClass,
} from "../../../src/lib/question-bank/import/oracle-scenarios.ts";
import { QB_IMPORT_CODES } from "../../../src/lib/question-bank/import/validation-codes.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const oracle = JSON.parse(
  readFileSync(join(root, "docs/question-bank/QB02-IMPORT-TEST-VECTORS-50.json"), "utf8"),
) as { vectors: OracleVector[] };

assert.equal(oracle.vectors.length, 197);

const tallies: Record<VectorClass | "silent_skips", number> = {
  PASS: 0,
  EXPECTED_FAIL: 0,
  OWNER_DECISION_PENDING: 0,
  P1_UNSUPPORTED: 0,
  silent_skips: 0,
};

for (const vector of oracle.vectors) {
  test(`oracle ${vector.test_id} (${vector.category})`, () => {
    const result = executeOracleVector(vector);
    assert.equal(result.silent_skip, false, `${vector.test_id} silent skip`);
    tallies[result.classification] += 1;

    const expectedCodes = new Set(vector.expected_errors.map((e) => e.code));
    const actualCodes = new Set(result.errors.map((e) => e.code));

    if (expectedCodes.size) {
      for (const code of expectedCodes) {
        assert.ok(
          actualCodes.has(code),
          `${vector.test_id}: missing expected error ${code}; got ${[...actualCodes].join(",")}`,
        );
        assert.ok(
          Object.prototype.hasOwnProperty.call(QB_IMPORT_CODES, code),
          `${vector.test_id}: unregistered code ${code}`,
        );
      }
      assert.equal(result.normalized, null);
      assert.equal(result.file_blocking, vector.file_blocking);
      if (vector.row_blocking) assert.equal(result.row_blocking, true);
    } else if (vector.expected_normalized_output) {
      assert.ok(
        compareNormalized(result.normalized, vector.expected_normalized_output, vector.input),
        `${vector.test_id}: normalized mismatch\nactual=${JSON.stringify(result.normalized)}\nexpected=${JSON.stringify(vector.expected_normalized_output)}`,
      );
      assert.equal(result.row_blocking, false);
      assert.equal(result.file_blocking, false);
    } else {
      assert.fail(`${vector.test_id}: vector has neither errors nor output`);
    }
  });
}

test("oracle vector coverage summary has zero silent skips", () => {
  // Ensure every vector test above executed by recounting.
  let silent = 0;
  const recount: Record<VectorClass, number> = {
    PASS: 0,
    EXPECTED_FAIL: 0,
    OWNER_DECISION_PENDING: 0,
    P1_UNSUPPORTED: 0,
  };
  for (const vector of oracle.vectors) {
    const result = executeOracleVector(vector);
    if (result.silent_skip) silent += 1;
    recount[result.classification] += 1;
  }
  assert.equal(oracle.vectors.length, 197);
  assert.equal(silent, 0);
  assert.equal(
    recount.PASS + recount.EXPECTED_FAIL + recount.OWNER_DECISION_PENDING + recount.P1_UNSUPPORTED,
    197,
  );
  console.log("QB02 oracle tallies", recount);
});
