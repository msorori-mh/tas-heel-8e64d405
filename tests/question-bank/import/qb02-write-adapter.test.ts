import assert from "node:assert/strict";
import test from "node:test";
import { runQuestionBankImportDryRun, runOperationalQuestionBankImportDryRun } from "../../../src/lib/question-bank/import/dry-run.ts";
import { CONTRACT_HEADERS } from "../../../src/lib/question-bank/import/adapters/detect.ts";
import { OFFICIAL_FLAT_V0 } from "../../../src/lib/question-bank/import/adapters/official-flat-v0.ts";
import { buildMinimalValidXlsx } from "../../fixtures/question-bank/import/binary-fixtures.ts";

const VALID_AUTH = {
  authenticated: true,
  actorId: "actor-123",
  authorized: true,
  capability: "question_bank.import",
  scope: "tenant:default",
  context: { actorId: "actor-123" },
};

test("Dry Run NEVER calls Write Adapter (Test 1: injected spy write adapter has 0 invocations)", async () => {
  let writeAdapterCalls = 0;
  const spyWriteAdapter = async (data: unknown) => {
    writeAdapterCalls++;
    return { ok: true };
  };

  const sampleRow = {
    question_code: "Q1",
    question_text: "Compute 1+1",
    interaction_type: "SINGLE_CHOICE",
    grading_mode: "AUTO_SINGLE",
    option_1: "1",
    option_2: "2",
    correct_index: 1,
    max_score: 1,
    subject_code: "MATH-G10",
  };

  const res = runQuestionBankImportDryRun({
    fileName: "test.xlsx",
    headers: [...CONTRACT_HEADERS[OFFICIAL_FLAT_V0]],
    rows: [sampleRow],
    authorized: VALID_AUTH,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    deps: { writeAdapter: spyWriteAdapter },
  });

  assert.equal(res.summary.file_blocking, false);
  assert.equal(res.summary.ok_rows, 1);
  assert.equal(res.apply_token_contract.mintable, false);
  assert.equal(writeAdapterCalls, 0, "Write adapter must not be called during dry run");
});

test("Dry Run NEVER calls Write Adapter (Test 2: throwing write adapter does not prevent successful dry run)", async () => {
  const throwingWriteAdapter = () => {
    throw new Error("DATABASE_WRITE_FORBIDDEN: Dry-run must never mutate database state!");
  };

  const sampleRow = {
    question_code: "Q1",
    question_text: "Compute 1+1",
    interaction_type: "SINGLE_CHOICE",
    grading_mode: "AUTO_SINGLE",
    option_1: "1",
    option_2: "2",
    correct_index: 1,
    max_score: 1,
    subject_code: "MATH-G10",
  };

  const res = runQuestionBankImportDryRun({
    fileName: "test.xlsx",
    headers: [...CONTRACT_HEADERS[OFFICIAL_FLAT_V0]],
    rows: [sampleRow],
    authorized: VALID_AUTH,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    deps: { writeAdapter: throwingWriteAdapter },
  });

  assert.equal(res.summary.file_blocking, false);
  assert.equal(res.summary.ok_rows, 1);
  assert.equal(res.apply_token_contract.mintable, false);
});

test("Dry Run operational path with throwing write adapter remains side-effect free and deterministic", async () => {
  const bytes = await buildMinimalValidXlsx();

  const throwingWriteAdapter = () => {
    throw new Error("DATABASE_WRITE_FORBIDDEN!");
  };

  const res1 = await runOperationalQuestionBankImportDryRun({
    fileName: "test.xlsx",
    bytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
    deps: { writeAdapter: throwingWriteAdapter },
  });

  const res2 = await runOperationalQuestionBankImportDryRun({
    fileName: "test.xlsx",
    bytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
    deps: { writeAdapter: throwingWriteAdapter },
  });

  assert.equal(res1.summary.file_blocking, false);
  assert.equal(res1.summary.ok_rows, 1);
  assert.equal(res1.apply_token_contract.mintable, false);
  assert.equal(res1.validation_hash, res2.validation_hash, "Dry run must be deterministically repeatable");
});
