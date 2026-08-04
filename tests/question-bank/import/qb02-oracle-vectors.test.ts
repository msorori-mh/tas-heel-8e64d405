import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildOperationalInput,
  executeOperationalInput,
  classifyVector,
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

assert.equal(oracle.vectors.length, 197, "Oracle vectors count must be 197");

// Counts tracking
let executableCount = 0;
let designOnlyCount = 0;

for (const vector of oracle.vectors) {
  const kind: ExecutionKind = classifyVector(vector);
  if (kind === "DESIGN_ONLY_NOT_EXECUTABLE") {
    designOnlyCount++;
  } else {
    executableCount++;
  }

  test(`QB02 Oracle ${vector.test_id} [${kind}]`, async (t) => {
    if (kind === "DESIGN_ONLY_NOT_EXECUTABLE") {
      t.skip(`Design-only vector ${vector.test_id} is not executable in runtime engine`);
      return;
    }

    // Layer B: Build Operational Input (no expected metadata visible)
    const input = await buildOperationalInput(vector);

    // Layer C: Execute through Public Production Entry Point
    const res = await executeOperationalInput(input);

    // Layer D: Assertion Layer compares Actual vs Expected
    const expectedCodes = new Set(vector.expected_errors.map((e) => e.code));
    const actualCodes = new Set(res.actual_codes);

    if (expectedCodes.size) {
      for (const code of expectedCodes) {
        assert.ok(
          actualCodes.has(code),
          `${vector.test_id}: missing expected error ${code}; got [${[...actualCodes].join(", ")}]`,
        );
        assert.ok(
          Object.prototype.hasOwnProperty.call(QB_IMPORT_CODES, code),
          `${vector.test_id}: unregistered code ${code}`,
        );
      }
      if (vector.row_blocking) {
        assert.equal(res.normalized, null, `${vector.test_id}: normalized output should be null on row blocking error`);
      }
      if (vector.file_blocking) {
        assert.equal(res.file_blocking, true, `${vector.test_id}: file_blocking mismatch`);
      }
    } else if (vector.expected_normalized_output) {
      assert.ok(
        compareNormalized(res.normalized, vector.expected_normalized_output),
        `${vector.test_id}: normalized mismatch`,
      );
      assert.equal(res.row_blocking, false);
      assert.equal(res.file_blocking, false);
    }
  });
}

test("Oracle reconciliation summary: individual tests registered", () => {
  assert.equal(oracle.vectors.length, 197);
  assert.ok(executableCount > 0, "Executable count must be > 0");
  console.log(`QB02 Oracle vectors reconciliation: Total=${oracle.vectors.length}, Executable=${executableCount}, DesignOnly=${designOnlyCount}`);
});

test("Metamorphic Oracle Isolation: identical operational inputs produce identical results regardless of test metadata mutations", async () => {
  PARSER_SPY.reset();

  const sampleVector = oracle.vectors[0]!;
  const inputA = await buildOperationalInput(sampleVector);
  const inputB = await buildOperationalInput({
    ...sampleVector,
    test_id: "MUTATED-ID-001",
    category: "mutated_category",
    expected_errors: [{ code: "SYNTHETIC_MUTATION_CODE" }],
  });

  const resA = await executeOperationalInput(inputA);
  const resB = await executeOperationalInput(inputB);

  assert.equal(resA.issues.length, resB.issues.length);
  assert.deepEqual(resA.actual_codes, resB.actual_codes);
});
