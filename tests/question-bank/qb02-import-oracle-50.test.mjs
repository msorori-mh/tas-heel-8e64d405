import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const docs = join(root, "docs", "question-bank");
const codes = JSON.parse(readFileSync(join(docs, "QB02-IMPORT-VALIDATION-CODES-50.json"), "utf8"));
const oracle = JSON.parse(readFileSync(join(docs, "QB02-IMPORT-TEST-VECTORS-50.json"), "utf8"));

const CONTRACTS = ["teacher_flat_ar_v0", "official_flat_v0", "legacy_flat_15col"];
const REQUIRED_VECTOR_FIELDS = [
  "test_id",
  "source_contract",
  "input",
  "preconditions",
  "expected_schema",
  "expected_normalized_output",
  "expected_errors",
  "expected_warnings",
  "row_blocking",
  "file_blocking",
  "security_expectation",
  "idempotency_expectation",
];
const EXPECTED_MAPPINGS = {
  teacher_flat_ar_v0: [
    "رمز_السؤال",
    "نص_السؤال",
    "نوع_السؤال",
    "الخيار_١",
    "الخيار_٢",
    "الخيار_٣",
    "الخيار_٤",
    "الخيار_٥",
    "الخيار_٦",
    "رقم_الإجابة_الصحيحة",
    "الإجابات_المقبولة",
    "الشرح",
    "الدرجة",
    "السماح_بالجزئي",
    "رمز_المادة",
    "رمز_الدرس",
    "رابط_الوسائط",
    "نوع_الوسائط",
    "نص_بديل",
  ],
  official_flat_v0: [
    "question_code",
    "question_text",
    "interaction_type",
    "grading_mode",
    "option_1",
    "option_2",
    "option_3",
    "option_4",
    "option_5",
    "option_6",
    "correct_index",
    "accepted_answers",
    "explanation",
    "stimulus_text",
    "max_score",
    "allow_partial",
    "subject_code",
    "lesson_code",
    "media_url",
    "media_type",
    "media_alt",
  ],
  legacy_flat_15col: [
    "code",
    "lesson_code",
    "subject_code",
    "question",
    "answer_a",
    "answer_b",
    "answer_c",
    "answer_d",
    "correct_index",
    "explanation",
    "question_type",
    "year",
    "semester",
    "sort_order",
    "media_url",
  ],
};
const THREATS = Array.from({ length: 25 }, (_, i) => `T${String(i + 1).padStart(2, "0")}_`);

test("oracle JSON documents have the expected versions and minimum size", () => {
  assert.equal(codes.oracle_version, "QB02-IMPORT-VALIDATION-CODES-50");
  assert.equal(codes.closed_registry, true);
  assert.equal(oracle.oracle_version, "QB02-IMPORT-TEST-VECTORS-50");
  assert.equal(oracle.target_contract, "official_normalized_v1");
  assert.ok(oracle.vectors.length >= 150, `found ${oracle.vectors.length} vectors`);
});

test("validation codes are unique and internally consistent", () => {
  const seen = new Set();
  for (const item of codes.codes) {
    assert.match(item.code, /^[A-Z][A-Z0-9_]+$/);
    assert.ok(!seen.has(item.code), `duplicate validation code: ${item.code}`);
    seen.add(item.code);
    assert.ok(["error", "warning"].includes(item.severity));
    assert.ok(["row", "file"].includes(item.scope));
    assert.equal(item.row_blocking && item.file_blocking, false);
    assert.equal(item.row_blocking, item.severity === "error" && item.scope === "row");
    assert.equal(item.file_blocking, item.severity === "error" && item.scope === "file");
    assert.ok(item.message.length > 0);
  }
});

test("every vector has the acceptance-matrix shape, unique ID, and registered codes", () => {
  const ids = new Set();
  const registry = new Map(codes.codes.map((item) => [item.code, item]));
  for (const vector of oracle.vectors) {
    for (const field of REQUIRED_VECTOR_FIELDS) {
      assert.ok(Object.hasOwn(vector, field), `${vector.test_id ?? "unknown"}: missing ${field}`);
    }
    assert.match(vector.test_id, /^QB02-\d{3}$/);
    assert.ok(!ids.has(vector.test_id), `duplicate test ID: ${vector.test_id}`);
    ids.add(vector.test_id);
    assert.ok(CONTRACTS.includes(vector.source_contract));
    assert.equal(vector.expected_schema, "official_normalized_v1");
    assert.equal(typeof vector.row_blocking, "boolean");
    assert.equal(typeof vector.file_blocking, "boolean");
    assert.equal(vector.row_blocking && vector.file_blocking, false);
    for (const issue of vector.expected_errors) {
      assert.equal(
        registry.get(issue.code)?.severity,
        "error",
        `${vector.test_id}: ${issue.code} is not a registered error`,
      );
    }
    for (const issue of vector.expected_warnings) {
      assert.equal(
        registry.get(issue.code)?.severity,
        "warning",
        `${vector.test_id}: ${issue.code} is not a registered warning`,
      );
    }
    if (vector.expected_errors.length) {
      assert.equal(
        vector.expected_normalized_output,
        null,
        `${vector.test_id}: errors cannot yield output`,
      );
    }
  }
});

test("mapping manifest is complete for every legacy/source contract", () => {
  assert.deepEqual(Object.keys(oracle.mapping_fields).sort(), [...CONTRACTS].sort());
  for (const contract of CONTRACTS) {
    assert.deepEqual(oracle.mapping_fields[contract], EXPECTED_MAPPINGS[contract]);
    assert.ok(oracle.vectors.some((v) => v.source_contract === contract));
  }
  assert.equal(oracle.mapping_fields.legacy_flat_15col.length, 15);
});

test("all supported interaction/grading modes and requested domains are covered", () => {
  const positiveOutputs = oracle.vectors
    .map((v) => v.expected_normalized_output)
    .filter((v) => v?.revision);
  for (const [interaction, grading] of oracle.supported_types) {
    assert.ok(
      positiveOutputs.some(
        (out) =>
          out.revision.interaction_type === interaction && out.revision.grading_mode === grading,
      ),
      `missing ${interaction}/${grading}`,
    );
  }
  for (const tag of [
    "MCQ",
    "AUTO_TEXT",
    "manual_grading",
    "arabic_content",
    "scientific_notation",
    "media",
    "duplicate_detection",
    "idempotency",
  ]) {
    assert.ok(
      oracle.vectors.some((v) => v.tags.includes(tag)),
      `missing tag ${tag}`,
    );
  }
  for (const category of [
    "positive",
    "negative",
    "boundary",
    "security",
    "compatibility",
    "idempotency",
    "performance",
    "media",
  ]) {
    assert.ok(
      oracle.vectors.some((v) => v.category === category),
      `missing ${category}`,
    );
  }
});

test("all security threats have at least two independent vectors", () => {
  for (const prefix of THREATS) {
    const covered = oracle.vectors.filter((v) => v.threat_ids.some((id) => id.startsWith(prefix)));
    assert.ok(covered.length >= 2, `${prefix} has ${covered.length} vectors`);
  }
});

test("index bases and zero/one boundary cases are explicit", () => {
  assert.deepEqual(oracle.index_semantics, {
    teacher_flat_ar_v0: "1-based",
    official_flat_v0: "1-based",
    legacy_flat_15col: "0-based",
    official_normalized_v1: "0-based",
  });
  for (const boundary of [
    "index_zero_official",
    "index_one_official",
    "index_six_official",
    "index_seven_official",
    "index_zero_legacy",
    "index_three_legacy",
    "index_four_legacy",
  ]) {
    assert.ok(
      oracle.vectors.some((v) => v.input.boundary === boundary),
      `missing ${boundary}`,
    );
  }
});

test("security registry codes and decision-state documentation are represented", () => {
  const registry = new Set(codes.codes.map((item) => item.code));
  for (const code of [
    "FORMULA_CELL",
    "FORMULA_INJECTION",
    "PATH_TRAVERSAL",
    "MEDIA_URL_INVALID",
    "DUPLICATE_CODE_EXISTS",
    "CROSS_SUBJECT_MAPPING",
    "CROSS_LESSON_MAPPING",
    "UNAUTHORIZED_IMPORT",
    "PRIVILEGE_ESCALATION",
    "CONTENT_HASH_MISMATCH",
    "MALFORMED_UNICODE",
    "ZIP_BOMB_SUSPECTED",
    "EXTERNAL_LINK",
    "MACRO_CONTENT",
  ])
    assert.ok(registry.has(code), `missing security code ${code}`);

  const contractDoc = readFileSync(join(docs, "QB02-IMPORT-CONTRACT-ORACLE-50.md"), "utf8");
  for (const label of ["READY_TO_APPROVE", "NEEDS_OWNER_DECISION", "DEFER_TO_P1"]) {
    assert.match(contractDoc, new RegExp(label));
  }
});
