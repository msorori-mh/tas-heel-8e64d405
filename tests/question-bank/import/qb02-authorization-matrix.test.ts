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

const DENY_CASES: Array<{ name: string; auth: unknown }> = [
  { name: "omitted", auth: undefined },
  { name: "undefined", auth: undefined },
  { name: "null", auth: null },
  { name: "false", auth: false },
  { name: "true boolean", auth: true },
  { name: "empty object", auth: {} },
  { name: "valid:true only", auth: { valid: true } },
  { name: "authorized:true only", auth: { authorized: true } },
  {
    name: "authenticated missing",
    auth: { actorId: "a", authorized: true, capability: "question_bank.import", scope: "tenant:default", context: {} },
  },
  {
    name: "authenticated:false",
    auth: { ...VALID_AUTH, authenticated: false },
  },
  {
    name: "actorId missing",
    auth: { authenticated: true, authorized: true, capability: "question_bank.import", scope: "tenant:default", context: {} },
  },
  {
    name: "actorId empty",
    auth: { ...VALID_AUTH, actorId: "   " },
  },
  {
    name: "capability missing",
    auth: { authenticated: true, actorId: "a", authorized: true, scope: "tenant:default", context: {} },
  },
  {
    name: "capability wrong",
    auth: { ...VALID_AUTH, capability: "wrong.capability" },
  },
  {
    name: "scope missing",
    auth: { authenticated: true, actorId: "a", authorized: true, capability: "question_bank.import", context: {} },
  },
  {
    name: "scope wrong",
    auth: { ...VALID_AUTH, scope: "tenant:other" },
  },
  {
    name: "scope wildcard *",
    auth: { ...VALID_AUTH, scope: "*" },
  },
  {
    name: "role-label-only",
    auth: { role: "admin" },
  },
  {
    name: "revoked:true",
    auth: { ...VALID_AUTH, revoked: true },
  },
  {
    name: "expired:true",
    auth: { ...VALID_AUTH, expired: true },
  },
  {
    name: "expiresAt in past",
    auth: { ...VALID_AUTH, expiresAt: Date.now() - 10_000 },
  },
  {
    name: "malformed context string",
    auth: { ...VALID_AUTH, context: "invalid_string_context" },
  },
  {
    name: "malformed context null",
    auth: { ...VALID_AUTH, context: null },
  },
  {
    name: "malformed context array",
    auth: { ...VALID_AUTH, context: ["array_not_object"] },
  },
  {
    name: "authorized:false within completed context",
    auth: { ...VALID_AUTH, authorized: false },
  },
];

for (const c of DENY_CASES) {
  test(`Authorization DENY case: ${c.name} halts execution before all pipeline stages`, async () => {
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
      authorized: c.auth,
    });

    assert.equal(res.summary.file_blocking, true, `${c.name} must file block`);
    assert.equal(res.issues.length, 1, `${c.name} must emit auth failure issue`);
    assert.equal(res.preview.length, 0, `${c.name} preview must be empty on auth block`);
    assert.equal(res.accepted_set_hash, null, `${c.name} accepted_set_hash must be null`);
  });
}

test("Authorization ALLOW case: valid completed context passes auth check and continues execution", async () => {
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
  });

  assert.equal(res.summary.file_blocking, false);
  assert.equal(res.summary.ok_rows, 1);
});

test("Operational path verifies authorization FIRST before binary inspection or parsing", async () => {
  const bytes = await buildMinimalValidXlsx();

  const res = await runOperationalQuestionBankImportDryRun({
    fileName: "test.xlsx",
    bytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: false,
  });

  assert.equal(res.summary.file_blocking, true);
  assert.equal(res.preview.length, 0);
  assert.equal(res.issues[0]?.code === "UNAUTHORIZED_IMPORT" || res.issues[0]?.code === "AUTH_MISSING", true);
});
