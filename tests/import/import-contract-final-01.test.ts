import assert from "node:assert/strict";
import { test } from "node:test";

import {
  IMPORT_ENTITY_CONTRACTS,
  IMPORT_EXECUTION_ORDER,
  listBlockingContractGaps,
  resolveImportRowAction,
  PUBLICATION_STATES,
  REVIEW_STATES,
} from "../../src/lib/import/import-contract.ts";
import {
  CONTENT_IMPORT_CODES,
  SHARED_IMPORT_CODES,
  isKnownImportCode,
  questionBankCodeDefinition,
} from "../../src/lib/import/import-error-codes.ts";
import { CONTENT_IMPORT_TEMPLATE_KEYS } from "../../src/lib/content-import/content-import-templates.ts";

test("every template has an entity contract", () => {
  for (const key of CONTENT_IMPORT_TEMPLATE_KEYS) {
    const contract = IMPORT_ENTITY_CONTRACTS[key];
    assert.ok(contract, `missing contract for ${key}`);
    assert.equal(contract.templateKey, key);
    assert.ok(contract.table.length > 0);
    assert.ok(contract.naturalKey.length > 0);
  }
});

test("execution order is dependency-correct", () => {
  const seen = new Set<string>();
  for (const key of IMPORT_EXECUTION_ORDER) {
    for (const dep of IMPORT_ENTITY_CONTRACTS[key].dependsOn) {
      assert.ok(seen.has(dep), `${key} imported before its dependency ${dep}`);
    }
    seen.add(key);
  }
  assert.equal(IMPORT_EXECUTION_ORDER.length, CONTENT_IMPORT_TEMPLATE_KEYS.length);
});

test("questions and assessment links come after their parents", () => {
  const idx = (k: string) => IMPORT_EXECUTION_ORDER.indexOf(k as never);
  assert.ok(idx("questions") > idx("lessons"));
  assert.ok(idx("assessment_questions") > idx("questions"));
  assert.ok(idx("assessment_questions") > idx("assessments"));
  assert.ok(idx("book_contents") > idx("lessons"));
  assert.ok(idx("units") > idx("subjects"));
});

test("natural keys with db_unique name a real audited constraint", () => {
  const audited = new Set([
    "subjects_code_uniq",
    "units_code_subject_uniq",
    "lessons_subject_id_slug_key",
    "questions_code_uniq",
    "lesson_book_contents_lesson_id_key",
    "assessment_questions_unique",
  ]);
  for (const key of CONTENT_IMPORT_TEMPLATE_KEYS) {
    const u = IMPORT_ENTITY_CONTRACTS[key].uniqueness;
    if (u.kind === "db_unique") {
      assert.ok(audited.has(u.constraint), `${key}: unknown constraint ${u.constraint}`);
    } else {
      assert.ok(u.gap.length > 0, `${key}: unenforced uniqueness must document a gap`);
    }
  }
});

test("entities without DB-enforced uniqueness are declared as blocking gaps", () => {
  const gapKeys = new Set(listBlockingContractGaps().map((g) => g.templateKey));
  for (const key of CONTENT_IMPORT_TEMPLATE_KEYS) {
    if (IMPORT_ENTITY_CONTRACTS[key].uniqueness.kind === "not_enforced") {
      assert.ok(gapKeys.has(key), `${key} lacks uniqueness but declares no gap`);
    }
  }
});

test("questions are routed through the question-bank workflow", () => {
  assert.equal(IMPORT_ENTITY_CONTRACTS.questions.questionBankWorkflow, true);
});

test("review and publication remain independent axes", () => {
  assert.deepEqual([...REVIEW_STATES], ["pending", "approved", "rejected"]);
  assert.deepEqual([...PUBLICATION_STATES], ["draft", "published", "archived"]);
  for (const s of REVIEW_STATES) {
    assert.ok(!(PUBLICATION_STATES as readonly string[]).includes(s));
  }
});

test("idempotency matrix", () => {
  const base = { incomingRowHash: "h1", supportsRevision: false } as const;

  assert.equal(
    resolveImportRowAction({ ...base, target: "absent", storedRowHash: null }),
    "INSERT",
  );
  assert.equal(
    resolveImportRowAction({ ...base, target: "draft", storedRowHash: "h1" }),
    "SKIP",
  );
  assert.equal(
    resolveImportRowAction({ ...base, target: "published", storedRowHash: "h1" }),
    "SKIP",
  );
  assert.equal(
    resolveImportRowAction({ ...base, target: "draft", storedRowHash: "h0" }),
    "UPDATE_DRAFT",
  );
  assert.equal(
    resolveImportRowAction({ ...base, target: "published", storedRowHash: "h0" }),
    "BLOCKED_PUBLISHED",
  );
  assert.equal(
    resolveImportRowAction({ ...base, target: "published", storedRowHash: "h0", supportsRevision: true }),
    "NEW_REVISION",
  );
  assert.equal(
    resolveImportRowAction({ ...base, target: "archived", storedRowHash: null, supportsRevision: true }),
    "NEW_REVISION",
  );
});

test("a published row is never silently updated", () => {
  for (const supportsRevision of [true, false]) {
    const action = resolveImportRowAction({
      target: "published",
      storedRowHash: "old",
      incomingRowHash: "new",
      supportsRevision,
    });
    assert.notEqual(action, "UPDATE_DRAFT");
  }
});

test("shared error codes keep identical blocking semantics across both vocabularies", () => {
  assert.ok(SHARED_IMPORT_CODES.length > 0);
  for (const code of SHARED_IMPORT_CODES) {
    const content = CONTENT_IMPORT_CODES[code];
    const qb = questionBankCodeDefinition(code);
    assert.equal(content.severity, qb.severity, `${code}: severity mismatch`);
    assert.equal(content.rowBlocking, qb.rowBlocking, `${code}: rowBlocking mismatch`);
    assert.equal(content.fileBlocking, qb.fileBlocking, `${code}: fileBlocking mismatch`);
  }
});

test("every content code has an Arabic message and coherent blocking flags", () => {
  for (const [code, def] of Object.entries(CONTENT_IMPORT_CODES)) {
    assert.ok(def.ar.trim().length > 0, `${code}: missing Arabic message`);
    assert.ok(isKnownImportCode(code));
    if (def.severity !== "error") {
      assert.equal(def.rowBlocking, false, `${code}: non-error must not block a row`);
      assert.equal(def.fileBlocking, false, `${code}: non-error must not block the file`);
    }
    assert.ok(!(def.rowBlocking && def.fileBlocking), `${code}: cannot be both row and file blocking`);
  }
});
