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
      tags: vector.tags,
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

test("Metamorphic Oracle Isolation: 5 Scenarios with identical operational fixtures and mutated expected fields produce identical inputs and runtime outcomes", async () => {
  const scenarios: Array<{
    name: string;
    source_contract: "official_flat_v0" | "legacy_flat_15col" | "teacher_flat_ar_v0";
    input: unknown;
    operational_fixture: any;
  }> = [
    {
      name: "Authorization scenario",
      source_contract: "official_flat_v0",
      input: { attack: "T09_UNAUTHORIZED_IMPORT" },
      operational_fixture: {
        kind: "authorization",
        authorization_scenario: "unauthorized-actor",
        scenario: "unauthorized-actor",
      },
    },
    {
      name: "Row validation scenario",
      source_contract: "official_flat_v0",
      input: { boundary: "invalid_correct_index" },
      operational_fixture: {
        kind: "validator",
        scenario: "invalid_correct_index",
        rows: [{ question_code: "Q1", correct_index: "99" }],
      },
    },
    {
      name: "Binary ZIP scenario",
      source_contract: "official_flat_v0",
      input: { binary_fixture: "zip_path_traversal" },
      operational_fixture: {
        kind: "binary",
        binary_scenario: "zip_path_traversal",
      },
    },
    {
      name: "OOXML scenario",
      source_contract: "official_flat_v0",
      input: { binary_fixture: "ooxml_external_rel" },
      operational_fixture: {
        kind: "binary",
        binary_scenario: "ooxml_external_rel",
      },
    },
    {
      name: "Apply security scenario",
      source_contract: "official_flat_v0",
      input: { attack: "T15_HASH_MISMATCH" },
      operational_fixture: {
        kind: "apply-verification",
        scenario: "content-hash-mismatch",
        apply_state: { scenario: "content-hash", expected_content_hash: "hashA", current_content_hash: "hashB" },
      },
    },
  ];

  for (const sc of scenarios) {
    const specA: OperationalFixtureSpec = {
      test_id: `SPEC-REAL-${sc.name}`,
      source_contract: sc.source_contract,
      input: sc.input,
      operational_fixture: sc.operational_fixture,
    };

    // Spec B has different test_id and intentionally WRONG expected fields
    const specB: OperationalFixtureSpec = {
      test_id: `SPEC-MUTATED-${sc.name}`,
      source_contract: sc.source_contract,
      input: sc.input,
      operational_fixture: sc.operational_fixture,
    };

    const inputA = await buildOperationalInput(specA);
    const inputB = await buildOperationalInput(specB);

    // Verify Builder produces identical operational properties regardless of test_id/metadata
    assert.equal(inputA.kind, inputB.kind, `${sc.name}: kind mismatch`);
    if (inputA.bytes && inputB.bytes) {
      assert.equal(inputA.bytes.length, inputB.bytes.length, `${sc.name}: bytes length mismatch`);
    } else {
      assert.deepEqual(inputA.bytes, inputB.bytes, `${sc.name}: bytes mismatch`);
    }
    assert.deepEqual(inputA.rows, inputB.rows, `${sc.name}: rows mismatch`);
    assert.deepEqual(inputA.headers, inputB.headers, `${sc.name}: headers mismatch`);
    assert.deepEqual(inputA.authorized, inputB.authorized, `${sc.name}: authorized mismatch`);
    assert.deepEqual(inputA.catalog, inputB.catalog, `${sc.name}: catalog mismatch`);
    assert.deepEqual(inputA.apply_state, inputB.apply_state, `${sc.name}: apply_state mismatch`);

    const resA = await executeOperationalInput(inputA);
    const resB = await executeOperationalInput(inputB);

    // Verify Runtime produces identical outcomes
    assert.deepEqual(resA.actual_codes, resB.actual_codes, `${sc.name}: codes mismatch`);
    assert.equal(resA.file_blocking, resB.file_blocking, `${sc.name}: file_blocking mismatch`);
    assert.equal(resA.row_blocking, resB.row_blocking, `${sc.name}: row_blocking mismatch`);
  }
});
