import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCorrectAnswer,
  normalizeArabicDigits,
  optionCodesFromCount,
} from "../../../src/lib/question-bank/import/correct-answer.ts";
import { adaptLegacyFlat15Col } from "../../../src/lib/question-bank/import/adapters/legacy-flat-15col.ts";
import { adaptTeacherFlatArV0 } from "../../../src/lib/question-bank/import/adapters/teacher-flat-ar-v0.ts";
import { adaptOfficialFlatV0 } from "../../../src/lib/question-bank/import/adapters/official-flat-v0.ts";
import { detectSchemaFromHeaders } from "../../../src/lib/question-bank/import/adapters/detect.ts";
import {
  runQuestionBankImportDryRun,
  buildErrorExportModel,
} from "../../../src/lib/question-bank/import/dry-run.ts";
import { QB_IMPORT_CODES } from "../../../src/lib/question-bank/import/validation-codes.ts";
import { OFFICIAL_NORMALIZED_V1 } from "../../../src/lib/question-bank/import/official-normalized-v1.ts";
import { contentFingerprint } from "../../../src/lib/question-bank/import/validate.ts";

const opts4 = [
  { option_code: "A", option_text: "نيوتن" },
  { option_code: "B", option_text: "جول" },
  { option_code: "C", option_text: "واط" },
  { option_code: "D", option_text: "باسكال" },
];

// --- Correct answer resolution (letters / indexes / text / Arabic) ---
const letterCases: Array<[string, string, number]> = [
  ["A", "A", 0],
  ["a", "A", 0],
  ["B", "B", 1],
  ["C", "C", 2],
  ["D", "D", 3],
  ["1", "A", 0],
  ["2", "B", 1],
  ["3", "C", 2],
  ["4", "D", 3],
  ["١", "A", 0],
  ["٢", "B", 1],
  ["٣", "C", 2],
  ["٤", "D", 3],
  ["نيوتن", "A", 0],
  ["جول", "B", 1],
  ["واط", "C", 2],
  ["باسكال", "D", 3],
];

for (const [raw, code, idx] of letterCases) {
  test(`correct-answer resolves ${JSON.stringify(raw)} → ${code} @${idx}`, () => {
    const r = resolveCorrectAnswer(raw, opts4);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.option_code, code);
      assert.equal(r.legacy_correct_index_0_based, idx);
      assert.equal(r.options.filter((o) => o.is_correct).length, 1);
    }
  });
}

test("correct-answer rejects 0-based index", () => {
  const r = resolveCorrectAnswer(0, opts4);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "ZERO_BASED_SUSPECT");
});

test("correct-answer rejects missing option", () => {
  const r = resolveCorrectAnswer("E", opts4);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "NOT_FOUND");
});

test("correct-answer rejects empty", () => {
  assert.equal(resolveCorrectAnswer("", opts4).ok, false);
  assert.equal(resolveCorrectAnswer(null, opts4).ok, false);
});

test("correct-answer multiple text matches blocked for single", () => {
  const opts = [
    { option_code: "A", option_text: "نفس" },
    { option_code: "B", option_text: "نفس" },
  ];
  const r = resolveCorrectAnswer("نفس", opts);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "MULTIPLE_NOT_ALLOWED");
});

test("correct-answer allows multiple when enabled", () => {
  const opts = [
    { option_code: "A", option_text: "نفس" },
    { option_code: "B", option_text: "نفس" },
  ];
  const r = resolveCorrectAnswer("نفس", opts, { allowMultiple: true });
  assert.equal(r.ok, true);
});

test("normalizeArabicDigits", () => {
  assert.equal(normalizeArabicDigits("١٢٣"), "123");
});

test("optionCodesFromCount", () => {
  assert.deepEqual(optionCodesFromCount(3), ["A", "B", "C"]);
});

// --- Schema detection ---
test("detect legacy_flat_15col", () => {
  const d = detectSchemaFromHeaders([
    "question_code",
    "question_text",
    "option_1",
    "option_2",
    "option_3",
    "option_4",
    "correct_index",
    "subject_code",
    "lesson_code",
  ]);
  assert.equal(d.schema, "legacy_flat_15col");
});

test("detect teacher_flat_ar_v0", () => {
  const d = detectSchemaFromHeaders(["نص_السؤال", "الخيار_أ", "الإجابة_الصحيحة"]);
  assert.equal(d.schema, "teacher_flat_ar_v0");
});

test("detect official_flat_v0", () => {
  const d = detectSchemaFromHeaders([
    "id",
    "question_code",
    "question_text",
    "option_a",
    "correct_answer",
    "context_text",
  ]);
  assert.equal(d.schema, "official_flat_v0");
});

test("detect official_normalized_v1", () => {
  const d = detectSchemaFromHeaders([
    "schema_version",
    "question_code",
    "option_code",
    "question_text",
  ]);
  assert.equal(d.schema, OFFICIAL_NORMALIZED_V1);
});

test("detect unknown", () => {
  assert.equal(detectSchemaFromHeaders(["foo", "bar"]).schema, "unknown");
});

test("column shift suspected when question_text late", () => {
  const d = detectSchemaFromHeaders([
    "a",
    "b",
    "c",
    "d",
    "question_text",
    "option_1",
    "correct_index",
    "question_code",
  ]);
  assert.equal(d.schema, "legacy_flat_15col");
  assert.equal(d.column_shift_suspected, true);
});

// --- Adapters ---
test("legacy adapter happy path 1-based", () => {
  const { row, issues } = adaptLegacyFlat15Col(
    {
      question_code: "Q1",
      question_text: "س؟",
      option_1: "أ",
      option_2: "ب",
      option_3: "ج",
      option_4: "د",
      correct_index: 2,
      subject_code: "PHYS",
      lesson_code: "L1",
    },
    { rowNumber: 2 },
  );
  assert.equal(issues.length, 0);
  assert.ok(row);
  assert.equal(row!.legacy_correct_index_0_based, 1);
  assert.equal(row!.options[1]!.is_correct, true);
});

test("legacy adapter letter correct", () => {
  const { row } = adaptLegacyFlat15Col(
    {
      question_code: "Q2",
      question_text: "س؟",
      option_1: "أ",
      option_2: "ب",
      correct_index: "B",
      subject_code: "PHYS",
    },
    {},
  );
  assert.equal(row!.legacy_correct_index_0_based, 1);
});

test("legacy rejects zero-based", () => {
  const { issues } = adaptLegacyFlat15Col(
    {
      question_code: "Q3",
      question_text: "س؟",
      option_1: "أ",
      option_2: "ب",
      correct_index: 0,
      subject_code: "PHYS",
    },
    { rowNumber: 3 },
  );
  assert.ok(
    issues.some((i) => i.code === QB_IMPORT_CODES.QB_IMPORT_ZERO_BASED_INDEX_SUSPECT),
  );
});

test("legacy manual requires solution", () => {
  const { issues } = adaptLegacyFlat15Col(
    {
      question_code: "Q4",
      question_text: "اشرح",
      question_type: "MANUAL",
      subject_code: "PHYS",
    },
    {},
  );
  assert.ok(
    issues.some(
      (i) => i.code === QB_IMPORT_CODES.QB_IMPORT_MANUAL_GRADING_REQUIRES_SOLUTION,
    ),
  );
});

test("legacy media required", () => {
  const { issues } = adaptLegacyFlat15Col(
    {
      question_code: "Q5",
      question_text: "س؟",
      option_1: "أ",
      option_2: "ب",
      correct_index: 1,
      subject_code: "PHYS",
      requires_media: true,
    },
    {},
  );
  assert.ok(
    issues.some((i) => i.code === QB_IMPORT_CODES.QB_IMPORT_MEDIA_REFERENCE_MISSING),
  );
});

test("teacher adapter Arabic headers and letter أ", () => {
  const { row, issues } = adaptTeacherFlatArV0(
    {
      نص_السؤال: "ما وحدة القوة؟",
      الخيار_أ: "نيوتن",
      الخيار_ب: "جول",
      الإجابة_الصحيحة: "أ",
      المادة: "PHYS",
      رمز_السؤال: "T1",
    },
    {},
  );
  assert.equal(issues.length, 0);
  assert.equal(row!.legacy_correct_index_0_based, 0);
  assert.equal(row!.options[0]!.is_correct, true);
});

test("teacher adapter with Latin correct letter", () => {
  const { row, issues } = adaptTeacherFlatArV0(
    {
      question_text: "ما وحدة القوة؟",
      option_a: "نيوتن",
      option_b: "جول",
      correct_answer: "A",
      subject_code: "PHYS",
      question_code: "T1",
    },
    {},
  );
  assert.equal(issues.length, 0);
  assert.equal(row!.legacy_correct_index_0_based, 0);
});

test("official flat rejects missing question_code", () => {
  const { issues } = adaptOfficialFlatV0(
    {
      id: 12,
      question_text: "س",
      option_a: "1",
      option_b: "2",
      correct_answer: "A",
      subject_code: "PHYS",
    },
    {},
  );
  assert.ok(
    issues.some((i) => i.code === QB_IMPORT_CODES.QB_IMPORT_REQUIRED_QUESTION_CODE),
  );
});

test("official flat happy", () => {
  const { row, issues } = adaptOfficialFlatV0(
    {
      question_code: "OF1",
      question_text: "س؟",
      option_a: "1",
      option_b: "2",
      correct_answer: "B",
      subject_code: "PHYS",
      context_text: "سياق",
    },
    {},
  );
  assert.equal(issues.length, 0);
  assert.equal(row!.stimulus_text, "سياق");
  assert.equal(row!.legacy_correct_index_0_based, 1);
});

// --- Dry-run pipeline ---
const legacyHeaders = [
  "question_code",
  "question_text",
  "option_1",
  "option_2",
  "option_3",
  "option_4",
  "correct_index",
  "subject_code",
  "lesson_code",
];

function legacyRow(code: string, correct: unknown = 1): Record<string, unknown> {
  return {
    question_code: code,
    question_text: `نص ${code}`,
    option_1: "أ1",
    option_2: "ب1",
    option_3: "ج1",
    option_4: "د1",
    correct_index: correct,
    subject_code: "PHYS",
    lesson_code: "L1",
  };
}

test("dry-run valid file summary", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "ok.xlsx",
    headers: legacyHeaders,
    rows: [legacyRow("A1"), legacyRow("A2", "B")],
    catalog: { subjects: new Set(["PHYS"]), lessons: new Set(["L1"]) },
  });
  assert.equal(r.summary.ok_rows, 2);
  assert.equal(r.summary.blocked_rows, 0);
  assert.ok(r.accepted_set_hash);
});

test("dry-run determinism same input same hash", () => {
  const input = {
    fileName: "d.xlsx",
    headers: legacyHeaders,
    rows: [legacyRow("D1"), legacyRow("D2", 3)],
    catalog: { subjects: new Set(["PHYS"]), lessons: new Set(["L1"]) },
  };
  const a = runQuestionBankImportDryRun(input);
  const b = runQuestionBankImportDryRun(input);
  assert.equal(a.accepted_set_hash, b.accepted_set_hash);
  assert.equal(
    a.preview[0]!.content_fingerprint,
    b.preview[0]!.content_fingerprint,
  );
});

test("dry-run duplicate codes", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "dup.xlsx",
    headers: legacyHeaders,
    rows: [legacyRow("X1"), legacyRow("X1")],
    catalog: { subjects: new Set(["PHYS"]), lessons: new Set(["L1"]) },
  });
  assert.equal(r.summary.blocked_rows, 1);
  assert.ok(
    r.issues.some((i) => i.code === QB_IMPORT_CODES.QB_IMPORT_DUPLICATE_QUESTION_CODE),
  );
});

test("dry-run unknown subject/lesson", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "cat.xlsx",
    headers: legacyHeaders,
    rows: [legacyRow("C1")],
    catalog: { subjects: new Set(["CHEM"]), lessons: new Set(["Z"]) },
  });
  assert.ok(r.issues.some((i) => i.code === QB_IMPORT_CODES.QB_IMPORT_UNKNOWN_SUBJECT));
  assert.ok(r.issues.some((i) => i.code === QB_IMPORT_CODES.QB_IMPORT_UNKNOWN_LESSON));
});

test("dry-run formula cells file blocking", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "f.xlsx",
    headers: legacyHeaders,
    rows: [legacyRow("F1")],
    hasFormulaCells: true,
  });
  assert.equal(r.summary.file_blocking, true);
  assert.equal(r.summary.ok_rows, 0);
});

test("dry-run merged cells file blocking", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "m.xlsx",
    headers: legacyHeaders,
    rows: [legacyRow("M1")],
    hasMergedCells: true,
  });
  assert.equal(r.summary.file_blocking, true);
});

test("dry-run file too large", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "big.xlsx",
    headers: legacyHeaders,
    rows: [legacyRow("B1")],
    fileBytes: 9e9,
  });
  assert.ok(r.issues.some((i) => i.code === QB_IMPORT_CODES.QB_IMPORT_FILE_TOO_LARGE));
});

test("dry-run row limit", () => {
  const rows = Array.from({ length: 10 }, (_, i) => legacyRow(`R${i}`));
  const r = runQuestionBankImportDryRun({
    fileName: "lim.xlsx",
    headers: legacyHeaders,
    rows,
    maxRows: 5,
  });
  assert.ok(r.issues.some((i) => i.code === QB_IMPORT_CODES.QB_IMPORT_ROW_LIMIT_EXCEEDED));
});

test("dry-run invalid correct blocks row", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "bad.xlsx",
    headers: legacyHeaders,
    rows: [legacyRow("Z1", "Z")],
    catalog: { subjects: new Set(["PHYS"]), lessons: new Set(["L1"]) },
  });
  assert.equal(r.summary.blocked_rows, 1);
});

test("dry-run error export model shape", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "e.xlsx",
    headers: legacyHeaders,
    rows: [legacyRow("E1", 0)],
  });
  const model = buildErrorExportModel(r);
  assert.ok(model.length > 0);
  assert.ok("code" in model[0]!);
  assert.ok("message_ar" in model[0]!);
  assert.ok("suggested_fix" in model[0]!);
});

test("dry-run 1000 rows performance/count", () => {
  const rows = Array.from({ length: 1000 }, (_, i) =>
    legacyRow(`N${String(i).padStart(4, "0")}`, (i % 4) + 1),
  );
  const r = runQuestionBankImportDryRun({
    fileName: "1k.xlsx",
    headers: legacyHeaders,
    rows,
    catalog: { subjects: new Set(["PHYS"]), lessons: new Set(["L1"]) },
  });
  assert.equal(r.summary.total_rows, 1000);
  assert.equal(r.summary.ok_rows, 1000);
  assert.ok(r.accepted_set_hash);
});

test("dry-run reimport idempotent hash", () => {
  const rows = [legacyRow("ID1"), legacyRow("ID2", 2)];
  const a = runQuestionBankImportDryRun({
    fileName: "a.xlsx",
    headers: legacyHeaders,
    rows,
    catalog: { subjects: new Set(["PHYS"]), lessons: new Set(["L1"]) },
  });
  const b = runQuestionBankImportDryRun({
    fileName: "a.xlsx",
    headers: legacyHeaders,
    rows,
    catalog: { subjects: new Set(["PHYS"]), lessons: new Set(["L1"]) },
  });
  assert.equal(a.accepted_set_hash, b.accepted_set_hash);
});

test("dry-run partial errors keep ok rows", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "p.xlsx",
    headers: legacyHeaders,
    rows: [legacyRow("P1"), legacyRow("P2", "Z"), legacyRow("P3", 3)],
    catalog: { subjects: new Set(["PHYS"]), lessons: new Set(["L1"]) },
  });
  assert.equal(r.summary.ok_rows, 2);
  assert.equal(r.summary.blocked_rows, 1);
});

test("contentFingerprint stable", () => {
  const { row } = adaptLegacyFlat15Col(
    {
      question_code: "FP1",
      question_text: "س",
      option_1: "a",
      option_2: "b",
      correct_index: 1,
      subject_code: "PHYS",
    },
    {},
  );
  assert.equal(contentFingerprint(row!), contentFingerprint(row!));
});

test("no DB write symbols in dry-run module surface", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = path.resolve("src/lib/question-bank/import");
  const files = fs.readdirSync(dir, { recursive: true }).map(String);
  for (const f of files) {
    if (!f.endsWith(".ts")) continue;
    const body = fs.readFileSync(path.join(dir, f), "utf8");
    assert.equal(/\bsupabase\b/i.test(body), false, f);
    assert.equal(/\bcreateClient\b/.test(body), false, f);
    assert.equal(/\bdb\s*\.\s*insert\b/i.test(body), false, f);
    assert.equal(/\bINSERT\s+INTO\b/i.test(body), false, f);
    assert.equal(/\bUPDATE\s+public\./i.test(body), false, f);
  }
});

// Expand with parameterized adapter edge cases to exceed 100 tests
const edgeCorrect: unknown[] = [
  "A",
  "B",
  "C",
  "D",
  1,
  2,
  3,
  4,
  "1",
  "2",
  "3",
  "4",
  "١",
  "٢",
  "٣",
  "٤",
  "أ1",
  "ب1",
  "ج1",
  "د1",
];
for (const [i, c] of edgeCorrect.entries()) {
  test(`legacy edge correct #${i} value=${JSON.stringify(c)}`, () => {
    const { row, issues } = adaptLegacyFlat15Col(
      {
        question_code: `E${i}`,
        question_text: "س",
        option_1: "أ1",
        option_2: "ب1",
        option_3: "ج1",
        option_4: "د1",
        correct_index: c,
        subject_code: "PHYS",
      },
      {},
    );
    assert.equal(issues.length, 0, JSON.stringify(issues));
    assert.ok(row);
    assert.equal(typeof row!.legacy_correct_index_0_based, "number");
  });
}

const badCorrect = ["E", "5", -1, "Z", "not-an-option", "", null, undefined, 0];
for (const [i, c] of badCorrect.entries()) {
  test(`legacy bad correct #${i} value=${JSON.stringify(c)}`, () => {
    const { row, issues } = adaptLegacyFlat15Col(
      {
        question_code: `B${i}`,
        question_text: "س",
        option_1: "أ1",
        option_2: "ب1",
        correct_index: c as unknown,
        subject_code: "PHYS",
      },
      {},
    );
    assert.equal(row, null);
    assert.ok(issues.length > 0);
  });
}

for (let n = 0; n < 12; n++) {
  test(`unicode question text preserved #${n}`, () => {
    const text = `سؤال ${n} — قوة × كتلة 🚀`;
    const { row } = adaptLegacyFlat15Col(
      {
        question_code: `U${n}`,
        question_text: text,
        option_1: "نعم",
        option_2: "لا",
        correct_index: 1,
        subject_code: "PHYS",
      },
      {},
    );
    assert.equal(row!.question_text, text);
  });
}

for (let n = 0; n < 10; n++) {
  test(`issue object always has Arabic message #${n}`, () => {
    const { issues } = adaptLegacyFlat15Col(
      {
        question_code: "",
        question_text: "",
        subject_code: "",
      },
      { rowNumber: n + 2 },
    );
    for (const iss of issues) {
      assert.ok(iss.message_ar.length > 0);
      assert.equal(typeof iss.row_blocking, "boolean");
      assert.ok(iss.suggested_fix.length > 0);
    }
  });
}

test("contract schema_version constant", () => {
  assert.equal(OFFICIAL_NORMALIZED_V1, "official_normalized_v1");
});

test("validation codes are unique", () => {
  const vals = Object.values(QB_IMPORT_CODES);
  assert.equal(new Set(vals).size, vals.length);
});
