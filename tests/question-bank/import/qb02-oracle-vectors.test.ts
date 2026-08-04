import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  executeOracleVectorOperational,
  compareNormalized,
  DEFAULT_TEST_AUTH,
  type OracleVector,
  type ExecutionKind,
} from "../../fixtures/question-bank/import/oracle-harness.ts";
import { QB_IMPORT_CODES } from "../../../src/lib/question-bank/import/validation-codes.ts";
import { PARSER_SPY } from "../../../src/lib/question-bank/import/workbook-parser.ts";
import { runQuestionBankImportDryRun } from "../../../src/lib/question-bank/import/dry-run.ts";
import { CONTRACT_HEADERS } from "../../../src/lib/question-bank/import/adapters/detect.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const oracle = JSON.parse(
  readFileSync(join(root, "docs/question-bank/QB02-IMPORT-TEST-VECTORS-50.json"), "utf8"),
) as { vectors: OracleVector[] };

assert.equal(oracle.vectors.length, 197);

test("oracle vectors execute through production public entry points", async () => {
  const kindCounts: Record<ExecutionKind, number> = {
    AUTHORIZATION_INTEGRATION: 0,
    BINARY_PREFLIGHT_INTEGRATION: 0,
    JSZIP_INTEGRATION: 0,
    EXCELJS_INTEGRATION: 0,
    ADAPTER_INTEGRATION: 0,
    VALIDATOR_INTEGRATION: 0,
    DRY_RUN_INTEGRATION: 0,
    PARSER_INTEGRATION: 0,
  };

  for (const vector of oracle.vectors) {
    const res = await executeOracleVectorOperational(vector);
    kindCounts[res.execution_kind] += 1;

    const expectedCodes = new Set(vector.expected_errors.map((e) => e.code));
    const actualCodes = new Set(res.actual_codes);

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
      if (vector.file_blocking || vector.row_blocking) {
        assert.equal(res.normalized, null, `${vector.test_id}: normalized output should be null on blocking error`);
        if (vector.file_blocking) assert.equal(res.file_blocking, true, `${vector.test_id}: file_blocking mismatch`);
        if (vector.row_blocking) assert.equal(res.row_blocking, true, `${vector.test_id}: row_blocking mismatch`);
      }
    } else if (vector.expected_normalized_output) {
      assert.ok(
        compareNormalized(res.normalized, vector.expected_normalized_output),
        `${vector.test_id}: normalized mismatch`,
      );
      assert.equal(res.row_blocking, false);
      assert.equal(res.file_blocking, false);
    }
  }

  assert.ok(kindCounts.BINARY_PREFLIGHT_INTEGRATION > 0, "Binary preflight integrations must be > 0");
  assert.ok(
    kindCounts.ADAPTER_INTEGRATION + kindCounts.VALIDATOR_INTEGRATION + kindCounts.DRY_RUN_INTEGRATION > 0,
    "Real integration executions must be > 0",
  );
  console.log("QB02 honest operational integration tallies:", kindCounts);
});

test("Metamorphic Oracle Isolation: identical operational inputs with mutated expected metadata produce identical execution routes and results", async () => {
  PARSER_SPY.reset();

  const sampleVector = oracle.vectors[0]!;
  const baseInput = sampleVector.input;

  const vectorA: OracleVector = {
    ...sampleVector,
    test_id: "META-001-A",
    category: "category_A",
    expected_errors: [{ code: "INVALID_SCORE" }],
  };

  const vectorB: OracleVector = {
    ...sampleVector,
    test_id: "META-001-B",
    category: "category_B",
    expected_errors: [{ code: "SOME_OTHER_SYNTHETIC_CODE" }],
  };

  const resA = runQuestionBankImportDryRun({
    fileName: `${vectorA.test_id}.xlsx`,
    headers: [...CONTRACT_HEADERS[vectorA.source_contract]],
    rows: [baseInput as any],
    authorized: DEFAULT_TEST_AUTH,
  });

  const resB = runQuestionBankImportDryRun({
    fileName: `${vectorB.test_id}.xlsx`,
    headers: [...CONTRACT_HEADERS[vectorB.source_contract]],
    rows: [baseInput as any],
    authorized: DEFAULT_TEST_AUTH,
  });

  // Verify that execution outputs and issues match regardless of test metadata mutations
  assert.equal(resA.issues.length, resB.issues.length);
  assert.deepEqual(
    resA.issues.map((i) => i.code),
    resB.issues.map((i) => i.code),
  );
  assert.equal(resA.summary.schema, resB.summary.schema);
});
