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
  type OracleVector,
  type OperationalFixtureSpec,
  type ExecutionKind,
} from "../../fixtures/question-bank/import/oracle-harness.ts";
import { QB_IMPORT_CODES } from "../../../src/lib/question-bank/import/validation-codes.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const oracle = JSON.parse(
  readFileSync(join(root, "docs/question-bank/QB02-IMPORT-TEST-VECTORS-50.json"), "utf8"),
) as { vectors: OracleVector[] };

assert.equal(oracle.vectors.length, 197, "Oracle vectors count must be 197");

let executableCount = 0;
let designOnlyCount = 0;
let securitySkippedCount = 0;

for (const vector of oracle.vectors) {
  const kind: ExecutionKind = classifyVector(vector);
  if (kind === "DESIGN_ONLY_NOT_EXECUTABLE") {
    designOnlyCount++;
    if (vector.category === "security" || vector.tags.includes("security")) {
      securitySkippedCount++;
    }
  } else {
    executableCount++;
  }

  test(`QB02 Oracle ${vector.test_id} [${kind}]`, async (t) => {
    if (kind === "DESIGN_ONLY_NOT_EXECUTABLE") {
      t.skip(`Design-only vector ${vector.test_id} is not executable in runtime engine`);
      return;
    }

    // Layer B: Construct independent OperationalFixtureSpec without expected result fields
    const spec: OperationalFixtureSpec = {
      test_id: vector.test_id,
      source_contract: vector.source_contract,
      input: vector.input,
      scenario: String((vector.input as any)?.attack ?? (vector.input as any)?.scenario ?? ""),
      preconditions: vector.preconditions,
    };

    const input = await buildOperationalInput(spec);
    const res = await executeOperationalInput(input);

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
  assert.equal(securitySkippedCount, 0, "Security skipped count MUST be 0");
  console.log(`QB02 Oracle vectors reconciliation: Total=${oracle.vectors.length}, Executable=${executableCount}, DesignOnly=${designOnlyCount}, SecuritySkipped=${securitySkippedCount}`);
});

test("Metamorphic Oracle Isolation: identical operational inputs produce identical results regardless of test metadata mutations", async () => {
  const sampleVector = oracle.vectors[0]!;

  const specA: OperationalFixtureSpec = {
    test_id: sampleVector.test_id,
    source_contract: sampleVector.source_contract,
    input: sampleVector.input,
    preconditions: sampleVector.preconditions,
  };

  const specB: OperationalFixtureSpec = {
    test_id: "MUTATED-SPEC-ID",
    source_contract: sampleVector.source_contract,
    input: sampleVector.input,
    preconditions: sampleVector.preconditions,
  };

  const inputA = await buildOperationalInput(specA);
  const inputB = await buildOperationalInput(specB);

  const resA = await executeOperationalInput(inputA);
  const resB = await executeOperationalInput(inputB);

  assert.equal(resA.issues.length, resB.issues.length);
  assert.deepEqual(resA.actual_codes, resB.actual_codes);
});

test("Metamorphic Oracle Isolation 2: formula-injection operational spec behaves identically across metadata alterations", async () => {
  const formulaVector = oracle.vectors.find((v) => v.test_id === "QB02-132") ?? oracle.vectors[0]!;

  const spec1: OperationalFixtureSpec = {
    test_id: formulaVector.test_id,
    source_contract: formulaVector.source_contract,
    input: formulaVector.input,
    scenario: "T02_FORMULA_INJECTION",
    preconditions: formulaVector.preconditions,
  };

  const spec2: OperationalFixtureSpec = {
    test_id: "SYNTHETIC-ID-999",
    source_contract: formulaVector.source_contract,
    input: formulaVector.input,
    scenario: "T02_FORMULA_INJECTION",
    preconditions: formulaVector.preconditions,
  };

  const input1 = await buildOperationalInput(spec1);
  const input2 = await buildOperationalInput(spec2);

  const res1 = await executeOperationalInput(input1);
  const res2 = await executeOperationalInput(input2);

  assert.deepEqual(res1.actual_codes, res2.actual_codes);
  assert.equal(res1.file_blocking, res2.file_blocking);
});
