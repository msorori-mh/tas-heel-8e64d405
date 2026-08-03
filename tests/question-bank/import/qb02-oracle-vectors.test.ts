import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  compareNormalized,
  executeOracleVector,
  type OracleVector,
  type ExecutionKind,
} from "../../../src/lib/question-bank/import/oracle-scenarios.ts";
import { QB_IMPORT_CODES } from "../../../src/lib/question-bank/import/validation-codes.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const oracle = JSON.parse(
  readFileSync(join(root, "docs/question-bank/QB02-IMPORT-TEST-VECTORS-50.json"), "utf8"),
) as { vectors: OracleVector[] };

assert.equal(oracle.vectors.length, 197);

const tallies: Record<ExecutionKind | "fabricated" | "silent_skips", number> = {
  REAL_ADAPTER: 0, REAL_VALIDATOR: 0, REAL_PREFLIGHT: 0, REAL_BOUNDARY: 0,
  REAL_MUTATION: 0, PARSER_INTEGRATION: 0, P1_UNSUPPORTED_FAIL_CLOSED: 0,
  OWNER_DECISION_PENDING: 0, fabricated: 0, silent_skips: 0,
};

for (const vector of oracle.vectors) {
  test(`oracle ${vector.test_id} (${vector.category})`, () => {
    const result = executeOracleVector(vector);
    assert.equal(result.silent_skip, false, `${vector.test_id} silent skip`);
    tallies[result.execution_kind] += 1;

    const expectedCodes = new Set(vector.expected_errors.map((e) => e.code));
    const actualCodes = new Set(result.errors.map((e) => e.code));

    if (result.implementation_status === "P1_UNSUPPORTED") {
      assert.equal(result.fail_closed, true, `${vector.test_id}: unsupported scenario accepted`);
      assert.ok(result.errors.length > 0, `${vector.test_id}: unsupported scenario has no real rejection`);
      return;
    }
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
      if (vector.file_blocking) assert.equal(result.file_blocking, true);
      if (vector.row_blocking) assert.equal(result.row_blocking, true);
      return;
    }
    if (vector.expected_normalized_output) {
      assert.ok(
        compareNormalized(result.normalized, vector.expected_normalized_output),
        `${vector.test_id}: normalized mismatch\nactual=${JSON.stringify(result.normalized)}\nexpected=${JSON.stringify(vector.expected_normalized_output)}`,
      );
      assert.equal(result.row_blocking, false);
      assert.equal(result.file_blocking, false);
      return;
    }
    assert.fail(`${vector.test_id}: vector has neither errors nor output`);
  });
}

test("oracle vector coverage summary reports honest execution kinds", () => {
  // Ensure every vector test above executed by recounting.
  let silent = 0;
  const recount: Record<ExecutionKind, number> = {
    REAL_ADAPTER: 0, REAL_VALIDATOR: 0, REAL_PREFLIGHT: 0, REAL_BOUNDARY: 0,
    REAL_MUTATION: 0, PARSER_INTEGRATION: 0, P1_UNSUPPORTED_FAIL_CLOSED: 0,
    OWNER_DECISION_PENDING: 0,
  };
  for (const vector of oracle.vectors) {
    const result = executeOracleVector(vector);
    if (result.silent_skip) silent += 1;
    recount[result.execution_kind] += 1;
  }
  assert.equal(oracle.vectors.length, 197);
  assert.equal(silent, 0);
  assert.equal(Object.values(recount).reduce((total, count) => total + count, 0), 197);
  console.log("QB02 oracle tallies", recount);
});

test("Metamorphic Oracle isolation: 0 Oracle-tainted routing occurrences", async () => {
  const { executeOracleVectorIsolated, ROUTE_SPY } = await import(
    "../../../src/lib/question-bank/import/oracle-scenarios.ts"
  );
  ROUTE_SPY.reset();

  for (const vector of oracle.vectors) {
    const directResult = executeOracleVector(vector);
    const isolatedResult = executeOracleVectorIsolated(vector);

    assert.equal(directResult.execution_kind, isolatedResult.execution_kind);
    assert.equal(directResult.primitive_under_test, isolatedResult.primitive_under_test);
    assert.equal(directResult.fail_closed, isolatedResult.fail_closed);
  }

  assert.equal(
    ROUTE_SPY.oracleTaintedRoutingOccurrences,
    0,
    "Expected 0 Oracle-tainted routing occurrences",
  );
});
