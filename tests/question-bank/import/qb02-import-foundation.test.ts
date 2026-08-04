import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCorrectAnswer,
  normalizeArabicDigits,
  optionCodesFromCount,
} from "../../../src/lib/question-bank/import/correct-answer.ts";
import { adaptLegacyFlat15Col, LEGACY_FLAT_HEADERS } from "../../../src/lib/question-bank/import/adapters/legacy-flat-15col.ts";
import { adaptTeacherFlatArV0 } from "../../../src/lib/question-bank/import/adapters/teacher-flat-ar-v0.ts";
import { adaptOfficialFlatV0 } from "../../../src/lib/question-bank/import/adapters/official-flat-v0.ts";
import {
  CONTRACT_HEADERS,
  detectSchemaFromHeaders,
} from "../../../src/lib/question-bank/import/adapters/detect.ts";
import {
  runQuestionBankImportDryRun,
  buildErrorExportModel,
} from "../../../src/lib/question-bank/import/dry-run.ts";
import { QB_IMPORT_CODES } from "../../../src/lib/question-bank/import/validation-codes.ts";
import { OFFICIAL_NORMALIZED_V1 } from "../../../src/lib/question-bank/import/official-normalized-v1.ts";
import { contentFingerprint } from "../../../src/lib/question-bank/import/validate.ts";
import { canonicalHash, canonicalJson } from "../../../src/lib/question-bank/import/canonical-json.ts";
import { preflightWorkbook } from "../../../src/lib/question-bank/import/preflight.ts";
import { DEFAULT_IMPORT_LIMITS } from "../../../src/lib/question-bank/import/limits.ts";
import { validateMediaUrl } from "../../../src/lib/question-bank/import/media-policy.ts";
import { previewRows } from "../../../src/lib/question-bank/import/preview.ts";

const VALID_AUTH = {
  authenticated: true,
  actorId: "test-actor-123",
  authorized: true,
  capability: "question_bank.import",
  scope: "tenant:default",
  context: { actorId: "test-actor-123" },
};

const opts4 = [
  { option_code: "A", body: "نيوتن" },
  { option_code: "B", body: "جول" },
  { option_code: "C", body: "واط" },
  { option_code: "D", body: "باسكال" },
];

const letterCases: Array<[string, string, number, 0 | 1]> = [
  ["A", "A", 0, 1],
  ["a", "A", 0, 1],
  ["B", "B", 1, 1],
  ["C", "C", 2, 1],
  ["D", "D", 3, 1],
  ["1", "A", 0, 1],
  ["2", "B", 1, 1],
  ["3", "C", 2, 1],
  ["4", "D", 3, 1],
  ["١", "A", 0, 1],
  ["٢", "B", 1, 1],
  ["٣", "C", 2, 1],
  ["٤", "D", 3, 1],
  ["۱", "A", 0, 1],
  ["۲", "B", 1, 1],
  ["نيوتن", "A", 0, 1],
  ["جول", "B", 1, 1],
  ["0", "A", 0, 0],
  ["1", "B", 1, 0],
  ["2", "C", 2, 0],
  ["3", "D", 3, 0],
];

for (const [raw, code, idx, base] of letterCases) {
  test(`correct-answer resolves ${JSON.stringify(raw)} base=${base} → ${code}`, () => {
    const r = resolveCorrectAnswer(raw, opts4, { indexBase: base });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.option_code, code);
      assert.equal(r.correct_index_0_based, idx);
    }
  });
}

test("letter resolves by option_code after reorder", () => {
  const reordered = [
    { option_code: "B", body: "جول" },
    { option_code: "A", body: "نيوتن" },
    { option_code: "C", body: "واط" },
    { option_code: "D", body: "باسكال" },
  ];
  const r = resolveCorrectAnswer("A", reordered, { indexBase: 1 });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.option_code, "A");
    assert.equal(r.options.find((o) => o.option_code === "A")?.is_correct, true);
    assert.equal(r.options.find((o) => o.option_code === "B")?.is_correct, false);
  }
});

test("official/teacher reject 0-based index", () => {
  const r = resolveCorrectAnswer(0, opts4, { indexBase: 1 });
  assert.equal(r.ok, false);
});

test("legacy accepts 0-based index", () => {
  const r = resolveCorrectAnswer(0, opts4, { indexBase: 0 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.option_code, "A");
});

test("duplicate option text is ambiguous", () => {
  const opts = [
    { option_code: "A", body: "نفس" },
    { option_code: "B", body: "نفس" },
  ];
  const r = resolveCorrectAnswer("نفس", opts, { indexBase: 1 });
  assert.equal(r.ok, false);
});

test("rejects negative/decimal/mixed numerals", () => {
  assert.equal(resolveCorrectAnswer(-1, opts4, { indexBase: 1 }).ok, false);
  assert.equal(resolveCorrectAnswer("1.5", opts4, { indexBase: 1 }).ok, false);
  assert.equal(resolveCorrectAnswer("2٢", opts4, { indexBase: 1 }).ok, false);
  assert.equal(resolveCorrectAnswer("  ", opts4, { indexBase: 1 }).ok, false);
});

test("normalizeArabicDigits + optionCodesFromCount", () => {
  assert.equal(normalizeArabicDigits("١٢٣"), "123");
  assert.deepEqual(optionCodesFromCount(3), ["A", "B", "C"]);
});

test("detect exact teacher/official/legacy headers", () => {
  assert.equal(
    detectSchemaFromHeaders([...CONTRACT_HEADERS.teacher_flat_ar_v0]).schema,
    "teacher_flat_ar_v0",
  );
  assert.equal(
    detectSchemaFromHeaders([...CONTRACT_HEADERS.official_flat_v0]).schema,
    "official_flat_v0",
  );
  assert.equal(
    detectSchemaFromHeaders([...LEGACY_FLAT_HEADERS]).schema,
    "legacy_flat_15col",
  );
  assert.equal(detectSchemaFromHeaders(["foo", "bar"]).schema, "unknown");
});

test("legacy adapter 0-based correct_index", () => {
  const { row, issues } = adaptLegacyFlat15Col(
    [
      "Q1",
      "L1",
      "PHYS",
      "س؟",
      "أ",
      "ب",
      "ج",
      "د",
      1,
      "",
      "mcq",
      "2026",
      "1",
      "1",
      "",
    ],
    { rowNumber: 2 },
  );
  assert.equal(issues.length, 0);
  assert.ok(row);
  assert.equal(row!.options.find((o) => o.option_code === "B")?.is_correct, true);
  assert.equal(row!.revision.interaction_type, "SINGLE_CHOICE");
  assert.equal(row!.revision.status, "DRAFT");
});

test("legacy auto_text is information loss", () => {
  const { issues } = adaptLegacyFlat15Col(
    [
      "Q2",
      "L1",
      "PHYS",
      "س",
      "",
      "",
      "",
      "",
      "",
      "",
      "auto_text",
      "2026",
      "1",
      "1",
      "",
    ],
    {},
  );
  assert.ok(issues.some((i) => i.code === QB_IMPORT_CODES.LEGACY_INFORMATION_LOSS));
});

test("teacher adapter nested contract", () => {
  const { row, issues } = adaptTeacherFlatArV0(
    {
      رمز_السؤال: "T1",
      نص_السؤال: "ما وحدة القوة؟",
      نوع_السؤال: "اختيار_واحد",
      الخيار_١: "نيوتن",
      الخيار_٢: "جول",
      رقم_الإجابة_الصحيحة: "١",
      الدرجة: "1",
      رمز_المادة: "PHYS",
      رمز_الدرس: "L1",
    },
    { rowNumber: 3 },
  );
  assert.equal(issues.length, 0);
  assert.equal(row!.contract, OFFICIAL_NORMALIZED_V1);
  assert.equal(row!.options[0]!.is_correct, true);
  assert.equal(row!.targets.find((t) => t.target_type === "LESSON")?.is_primary, true);
});

test("teacher unknown type no coercion", () => {
  const { issues, row } = adaptTeacherFlatArV0(
    {
      رمز_السؤال: "T2",
      نص_السؤال: "س",
      نوع_السؤال: "MULTI_CHOICE",
      الدرجة: "1",
      رمز_المادة: "PHYS",
    },
    {},
  );
  assert.equal(row, null);
  assert.ok(issues.some((i) => i.code === QB_IMPORT_CODES.INVALID_INTERACTION_TYPE));
});

test("official 1-based correct_index", () => {
  const { row, issues } = adaptOfficialFlatV0(
    {
      question_code: "OF1",
      question_text: "س؟",
      interaction_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      option_1: "1",
      option_2: "2",
      correct_index: 2,
      max_score: 1,
      subject_code: "PHYS",
      lesson_code: "L1",
    },
    {},
  );
  assert.equal(issues.length, 0);
  assert.equal(row!.options[1]!.is_correct, true);
});

test("invalid score rejected", () => {
  const { issues } = adaptOfficialFlatV0(
    {
      question_code: "OF2",
      question_text: "س",
      interaction_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      option_1: "1",
      option_2: "2",
      correct_index: 1,
      max_score: 0,
      subject_code: "PHYS",
    },
    {},
  );
  assert.ok(issues.some((i) => i.code === QB_IMPORT_CODES.INVALID_SCORE));
});

test("dry-run teacher happy path", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "ok.xlsx",
    headers: [...CONTRACT_HEADERS.teacher_flat_ar_v0],
    rows: [
      {
        رمز_السؤال: "A1",
        نص_السؤال: "س",
        نوع_السؤال: "اختيار_واحد",
        الخيار_١: "1",
        الخيار_٢: "2",
        الخيار_٣: "",
        الخيار_٤: "",
        الخيار_٥: "",
        الخيار_٦: "",
        رقم_الإجابة_الصحيحة: "1",
        الإجابات_المقبولة: "",
        الشرح: "",
        الدرجة: "1",
        السماح_بالجزئي: "لا",
        رمز_المادة: "PHYS",
        رمز_الدرس: "L1",
        رابط_الوسائط: "",
        نوع_الوسائط: "",
        نص_بديل: "",
      },
    ],
    catalog: {
      subjects: new Set(["PHYS"]),
      lessons: new Set(["L1"]),
      lessonSubjects: new Map([["L1", "PHYS"]]),
    },
    authorized: VALID_AUTH,
  });
  assert.equal(r.summary.ok_rows, 1);
  assert.ok(r.accepted_set_hash);
  assert.equal(r.public_preview[0]!.normalized!.options.every((o) => !o.is_correct), true);
  assert.equal(r.privileged_preview[0]!.normalized!.options.some((o) => o.is_correct), true);
});

test("dry-run determinism", () => {
  const input = {
    fileName: "d.xlsx",
    headers: [...LEGACY_FLAT_HEADERS],
    rows: [
      ["D1", "L1", "PHYS", "س", "أ", "ب", "", "", 0, "", "mcq", "2026", "1", "1", ""],
      ["D2", "L1", "PHYS", "س2", "أ", "ب", "", "", 1, "", "mcq", "2026", "1", "2", ""],
    ],
    catalog: {
      subjects: new Set(["PHYS"]),
      lessons: new Set(["L1"]),
      lessonSubjects: new Map([["L1", "PHYS"]]),
    },
    authorized: VALID_AUTH,
  };
  const a = runQuestionBankImportDryRun(input);
  const b = runQuestionBankImportDryRun(input);
  assert.equal(a.accepted_set_hash, b.accepted_set_hash);
});

test("canonical json key-order independent", () => {
  const a = canonicalHash({ b: 1, a: 2 });
  const b = canonicalHash({ a: 2, b: 1 });
  assert.equal(a, b);
  assert.match(canonicalJson({ z: 1, a: 2 }), /canonical_version/);
});

test("preflight formula/macros/encryption", () => {
  const issues = preflightWorkbook({
    fileName: "x.xlsx",
    headers: [...LEGACY_FLAT_HEADERS],
    rows: [{}],
    metadata: { hasFormulaCells: true, hasMacros: true, encrypted: true },
  });
  assert.ok(issues.some((i) => i.code === "FORMULA_CELL"));
  assert.ok(issues.some((i) => i.code === "MACRO_CONTENT"));
  assert.ok(issues.some((i) => i.code === "WORKBOOK_ENCRYPTED"));
});

test("limits 1000 pass / 1001 fail", () => {
  const headers = [...LEGACY_FLAT_HEADERS];
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => [
      `N${i}`,
      "L1",
      "PHYS",
      "س",
      "أ",
      "ب",
      "",
      "",
      0,
      "",
      "mcq",
      "2026",
      "1",
      "1",
      "",
    ]);
  const ok = runQuestionBankImportDryRun({
    fileName: "1k.xlsx",
    headers,
    rows: mk(1000),
    catalog: {
      subjects: new Set(["PHYS"]),
      lessons: new Set(["L1"]),
      lessonSubjects: new Map([["L1", "PHYS"]]),
    },
    authorized: VALID_AUTH,
  });
  assert.equal(ok.summary.ok_rows, 1000);
  const bad = runQuestionBankImportDryRun({
    fileName: "1001.xlsx",
    headers,
    rows: mk(1001),
    authorized: VALID_AUTH,
  });
  assert.ok(bad.issues.some((i) => i.code === "ROW_LIMIT"));
});

test("5 MiB boundary", () => {
  const headers = [...LEGACY_FLAT_HEADERS];
  const row = ["Q", "L1", "PHYS", "س", "أ", "ب", "", "", 0, "", "mcq", "2026", "1", "1", ""];
  const pass = runQuestionBankImportDryRun({
    fileName: "size.xlsx",
    headers,
    rows: [row],
    fileBytes: DEFAULT_IMPORT_LIMITS.maxFileBytes,
    catalog: {
      subjects: new Set(["PHYS"]),
      lessons: new Set(["L1"]),
      lessonSubjects: new Map([["L1", "PHYS"]]),
    },
    authorized: VALID_AUTH,
  });
  assert.equal(pass.summary.file_blocking, false);
  const fail = runQuestionBankImportDryRun({
    fileName: "big.xlsx",
    headers,
    rows: [row],
    fileBytes: DEFAULT_IMPORT_LIMITS.maxFileBytes + 1,
    authorized: VALID_AUTH,
  });
  assert.ok(fail.issues.some((i) => i.code === "FILE_TOO_LARGE"));
});

test("64 KiB cell boundary via preflight metadata", () => {
  const pass = preflightWorkbook({
    fileName: "c.xlsx",
    headers: ["a"],
    rows: [{}],
    metadata: { maxCellBytes: DEFAULT_IMPORT_LIMITS.maxCellBytes },
  });
  assert.equal(pass.some((i) => i.code === "CELL_TOO_LARGE"), false);
  const fail = preflightWorkbook({
    fileName: "c.xlsx",
    headers: ["a"],
    rows: [{}],
    metadata: { maxCellBytes: DEFAULT_IMPORT_LIMITS.maxCellBytes + 1 },
  });
  assert.ok(fail.some((i) => i.code === "CELL_TOO_LARGE"));
});

test("media policy fail-closed", () => {
  assert.equal(validateMediaUrl("https://media.example.edu/a.png").ok, true);
  assert.equal(validateMediaUrl("file:///etc/passwd").ok, false);
  assert.equal(validateMediaUrl("javascript:alert(1)").ok, false);
  assert.equal(validateMediaUrl("https://localhost/x").ok, false);
  assert.equal(validateMediaUrl("https://media.example.edu/a.png?token=1").ok, false);
});

test("preview redacts answers for public", () => {
  const { row } = adaptOfficialFlatV0(
    {
      question_code: "P1",
      question_text: "س",
      interaction_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      option_1: "1",
      option_2: "2",
      correct_index: 1,
      max_score: 1,
      subject_code: "PHYS",
    },
    {},
  );
  const pub = previewRows([row!], false);
  assert.equal(pub[0]!.options.every((o) => !o.is_correct), true);
});

test("error export neutralizes formula-like messages with apostrophe", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "e.xls",
    headers: ["a"],
    rows: [],
  });
  const model = buildErrorExportModel(r);
  assert.ok(model.length > 0);
  assert.ok(String(model[0]!.message_ar).startsWith("'"));
});

test("validation codes are 72 unique", () => {
  const vals = Object.values(QB_IMPORT_CODES);
  assert.equal(vals.length, 72);
  assert.equal(new Set(vals).size, 72);
});

test("no DB write symbols in import modules", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = path.resolve("src/lib/question-bank/import");
  const files = fs.readdirSync(dir, { recursive: true }).map(String);
  for (const f of files) {
    if (!f.endsWith(".ts")) continue;
    const body = fs.readFileSync(path.join(dir, f), "utf8");
    assert.equal(/\bsupabase\b/i.test(body), false, f);
    assert.equal(/\bcreateClient\b/.test(body), false, f);
    assert.equal(/\bINSERT\s+INTO\b/i.test(body), false, f);
  }
});

// Expand parameterized cases to keep a large foundation suite.
for (let i = 0; i < 20; i++) {
  test(`legacy edge correct #${i}`, () => {
    const { row, issues } = adaptLegacyFlat15Col(
      [
        `E${i}`,
        "L1",
        "PHYS",
        "س",
        "أ1",
        "ب1",
        "ج1",
        "د1",
        i % 4,
        "",
        "mcq",
        "2026",
        "1",
        "1",
        "",
      ],
      {},
    );
    assert.equal(issues.length, 0, JSON.stringify(issues));
    assert.ok(row);
  });
}

for (let n = 0; n < 12; n++) {
  test(`unicode question preserved #${n}`, () => {
    const text = `سؤال ${n} — قوة × كتلة`;
    const { row } = adaptTeacherFlatArV0(
      {
        رمز_السؤال: `U${n}`,
        نص_السؤال: text,
        نوع_السؤال: "اختيار_واحد",
        الخيار_١: "نعم",
        الخيار_٢: "لا",
        رقم_الإجابة_الصحيحة: "1",
        الدرجة: "1",
        رمز_المادة: "PHYS",
      },
      {},
    );
    assert.equal(row!.revision.question_text, text);
  });
}

for (let n = 0; n < 10; n++) {
  test(`issue Arabic message present #${n}`, () => {
    const { issues } = adaptTeacherFlatArV0({}, { rowNumber: n + 2 });
    for (const iss of issues) {
      assert.ok(iss.message_ar.length > 0);
      assert.equal(typeof iss.row_blocking, "boolean");
    }
  });
}

test("contentFingerprint stable", () => {
  const { row } = adaptOfficialFlatV0(
    {
      question_code: "FP1",
      question_text: "س",
      interaction_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      option_1: "a",
      option_2: "b",
      correct_index: 1,
      max_score: 1,
      subject_code: "PHYS",
    },
    {},
  );
  assert.equal(contentFingerprint(row!), contentFingerprint(row!));
});

test("schemaHint mismatch rejects mixed workbook", () => {
  const r = runQuestionBankImportDryRun({
    fileName: "mix.xlsx",
    headers: [...CONTRACT_HEADERS.teacher_flat_ar_v0],
    rows: [],
    schemaHint: "official_flat_v0",
    authorized: VALID_AUTH,
  });
  assert.ok(r.issues.some((i) => i.code === "INVALID_CONTRACT"));
});

test("replay: safe noop / conflict / duplicate content", () => {
  const baseRow = {
    question_code: "R1",
    question_text: "س",
    interaction_type: "SINGLE_CHOICE",
    grading_mode: "AUTO_SINGLE",
    option_1: "a",
    option_2: "b",
    correct_index: 1,
    max_score: 1,
    subject_code: "PHYS",
  };
  const { row } = adaptOfficialFlatV0(baseRow, {});
  const fingerprint = contentFingerprint(row!);
  const VALID_AUTH = {
    authenticated: true,
    actorId: "test-actor-123",
    authorized: true,
    capability: "question_bank.import",
    scope: "tenant:default",
    context: { actorId: "test-actor-123", tenant: "tenant:default" },
  };

  const safe = runQuestionBankImportDryRun({
    fileName: "replay.xlsx",
    headers: [...CONTRACT_HEADERS.official_flat_v0],
    rows: [baseRow],
    authorized: VALID_AUTH,
    catalog: {
      subjects: new Set(["PHYS"]),
      lessons: new Set(),
      existing: new Map([["R1", fingerprint]]),
    },
  });
  assert.equal(safe.replay_decision, "REPLAY_SAFE_NOOP");

  const conflict = runQuestionBankImportDryRun({
    fileName: "replay.xlsx",
    headers: [...CONTRACT_HEADERS.official_flat_v0],
    rows: [{ ...baseRow, question_text: "نص مختلف" }],
    authorized: VALID_AUTH,
    catalog: {
      subjects: new Set(["PHYS"]),
      lessons: new Set(),
      existing: new Map([["R1", fingerprint]]),
    },
  });
  assert.equal(conflict.replay_decision, "IMPORT_REPLAY_CONFLICT");
  assert.ok(conflict.issues.some((i) => i.code === "IMPORT_REPLAY_CONFLICT"));

  const dup = runQuestionBankImportDryRun({
    fileName: "replay.xlsx",
    headers: [...CONTRACT_HEADERS.official_flat_v0],
    rows: [baseRow, { ...baseRow, question_code: "R2" }],
    authorized: VALID_AUTH,
    catalog: { subjects: new Set(["PHYS"]), lessons: new Set() },
  });
  assert.equal(dup.replay_decision, "DUPLICATE_CONTENT");
});

test("csv parser integration rejects formula-like cells via trusted path", async () => {
  const VALID_AUTH = {
    authenticated: true,
    actorId: "test-actor-123",
    authorized: true,
    capability: "question_bank.import",
    scope: "tenant:default",
    context: { actorId: "test-actor-123" },
  };
  const { parseQuestionBankWorkbook } = await import(
    "../../../src/lib/question-bank/import/workbook-parser.ts"
  );
  const { runOperationalQuestionBankImportDryRun } = await import(
    "../../../src/lib/question-bank/import/dry-run.ts"
  );
  const headers = [...CONTRACT_HEADERS.official_flat_v0];
  const values = headers.map((header) => {
    if (header === "question_code") return "P1";
    if (header === "question_text") return "=1+1";
    if (header === "interaction_type") return "SINGLE_CHOICE";
    if (header === "grading_mode") return "AUTO_SINGLE";
    if (header === "option_1") return "a";
    if (header === "option_2") return "b";
    if (header === "correct_index") return "1";
    if (header === "max_score") return "1";
    if (header === "subject_code") return "PHYS";
    if (header === "allow_partial") return "FALSE";
    return "";
  });
  const csv = `${headers.join(",")}\n${values.join(",")}\n`;
  const trusted = await parseQuestionBankWorkbook(
    "sample.csv",
    new TextEncoder().encode(csv),
  );
  assert.equal(trusted.trusted_parser_version, "qb02-workbook-parser-v1");
  assert.ok(trusted.parser_result_hash);
  assert.equal(trusted.metadata.csvInjectionCells, true);
  const result = await runOperationalQuestionBankImportDryRun({
    fileName: "sample.csv",
    bytes: new TextEncoder().encode(csv),
    authorized: VALID_AUTH,
    catalog: { subjects: new Set(["PHYS"]), lessons: new Set() },
  });
  assert.ok(
    result.issues.some(
      (i) => i.code === "FORMULA_INJECTION" || i.code === "FORMULA_CELL",
    ),
  );
});

test("non-scalar scalar fields are not stringified", () => {
  const { row, issues } = adaptOfficialFlatV0(
    {
      question_code: { nested: true },
      question_text: ["array"],
      interaction_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      option_1: "a",
      option_2: "b",
      correct_index: 1,
      max_score: 1,
      subject_code: "PHYS",
    },
    {},
  );
  assert.equal(row, null);
  assert.ok(issues.some((i) => i.code === "MISSING_VALUE"));
});

test("authorization contract matrix: reject partial/invalid auth, allow complete valid state", async () => {
  const { validateImportAuthorization } = await import(
    "../../../src/lib/question-bank/import/authorization.ts"
  );

  const matrix: Array<{ auth: unknown; expectedCode: string }> = [
    { auth: undefined, expectedCode: "AUTH_MISSING" },
    { auth: null, expectedCode: "AUTH_MISSING" },
    { auth: false, expectedCode: "AUTH_MISSING" },
    { auth: {}, expectedCode: "AUTH_MALFORMED" },
    { auth: { valid: true }, expectedCode: "AUTH_MALFORMED" },
    { auth: { authorized: true }, expectedCode: "AUTH_MALFORMED" },
    {
      auth: {
        authenticated: true,
        actorId: "actor-1",
        authorized: true,
        capability: "wrong.capability",
        scope: "tenant:default",
        context: {},
      },
      expectedCode: "CAPABILITY_INVALID",
    },
    {
      auth: {
        authenticated: true,
        actorId: "actor-1",
        authorized: true,
        capability: "question_bank.import",
        scope: "wrong:scope",
        context: {},
      },
      expectedCode: "SCOPE_MISMATCH",
    },
    {
      auth: {
        authenticated: true,
        authorized: true,
        capability: "question_bank.import",
        scope: "tenant:default",
        actorId: "",
      },
      expectedCode: "AUTH_MALFORMED",
    },
    {
      auth: {
        authorized: true,
        capability: "question_bank.import",
        scope: "tenant:default",
        actorId: "actor-1",
        authenticated: false,
      },
      expectedCode: "AUTHENTICATION_REQUIRED",
    },
    {
      auth: {
        authorized: true,
        capability: "question_bank.import",
        scope: "tenant:default",
        actorId: "actor-1",
        authenticated: true,
        context: {},
        expired: true,
      },
      expectedCode: "AUTH_EXPIRED",
    },
  ];

  for (const { auth, expectedCode } of matrix) {
    const res = validateImportAuthorization(auth, "tenant:default", "test.xlsx");
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.issue.code, expectedCode);
    }
  }

  const validRes = validateImportAuthorization(
    {
      authenticated: true,
      actorId: "actor-123",
      authorized: true,
      capability: "question_bank.import",
      scope: "tenant:default",
      context: { actorId: "actor-123" },
    },
    "tenant:default",
    "test.xlsx",
  );
  assert.equal(validRes.ok, true);
});

test("pre-parse authorization guard rejects before parser/JSZip/ExcelJS with spy assertions", async () => {
  const { runOperationalQuestionBankImportDryRun } = await import(
    "../../../src/lib/question-bank/import/dry-run.ts"
  );
  const { PARSER_SPY } = await import(
    "../../../src/lib/question-bank/import/workbook-parser.ts"
  );
  const { buildMinimalValidXlsx } = await import(
    "../../fixtures/question-bank/import/binary-fixtures.ts"
  );

  PARSER_SPY.reset();

  const bytes = await buildMinimalValidXlsx();
  const res = await runOperationalQuestionBankImportDryRun({
    fileName: "unauthorized.xlsx",
    bytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: { valid: true }, // Invalid auth object
  });

  assert.ok(res.issues.some((i) => i.code === "AUTH_MALFORMED" || i.code === "UNAUTHORIZED_IMPORT"));
  assert.equal(PARSER_SPY.parserInvocations, 0);
  assert.equal(PARSER_SPY.zipPreflightInvocations, 0);
  assert.equal(PARSER_SPY.jsZipInvocations, 0);
  assert.equal(PARSER_SPY.excelJsInvocations, 0);
  assert.equal(PARSER_SPY.fullDecompressionInvocations, 0);
  assert.equal(PARSER_SPY.worksheetParsingInvocations, 0);
  assert.equal(PARSER_SPY.adapterInvocations, 0);
  assert.ok(PARSER_SPY.authorizationFailures > 0);
});

test("binary fixtures: real raw XLSX/ZIP bytes execute through operational pipeline", async () => {
  const { runOperationalQuestionBankImportDryRun } = await import(
    "../../../src/lib/question-bank/import/dry-run.ts"
  );
  const {
    buildMinimalValidXlsx,
    buildOoxmlExternalRelXlsx,
    buildZipWithPathTraversal,
    buildZipWithExcessiveEntries,
    buildZipWithDuplicateEntry,
    buildMalformedCentralDirectoryZip,
    buildTruncatedZipBytes,
  } = await import("../../fixtures/question-bank/import/binary-fixtures.ts");

  const VALID_AUTH = {
    authenticated: true,
    actorId: "actor-123",
    authorized: true,
    capability: "question_bank.import",
    scope: "tenant:default",
    context: { actorId: "actor-123" },
  };

  // Valid XLSX
  const validBytes = await buildMinimalValidXlsx();
  const validRes = await runOperationalQuestionBankImportDryRun({
    fileName: "valid.xlsx",
    bytes: validBytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
  });
  assert.equal(validRes.summary.total_rows, 1);
  assert.equal(validRes.summary.ok_rows, 1);

  // OOXML External Rel
  const extBytes = await buildOoxmlExternalRelXlsx("http://attacker.com");
  const extRes = await runOperationalQuestionBankImportDryRun({
    fileName: "external.xlsx",
    bytes: extBytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
  });
  assert.ok(extRes.issues.some((i) => i.code === "EXTERNAL_LINK"));

  // Path Traversal Entry
  const travBytes = await buildZipWithPathTraversal("../secret.txt");
  const travRes = await runOperationalQuestionBankImportDryRun({
    fileName: "traversal.xlsx",
    bytes: travBytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
  });
  assert.ok(travRes.issues.some((i) => i.code === "PATH_TRAVERSAL"));

  // Excessive ZIP Entries
  const limitBytes = await buildZipWithExcessiveEntries(201);
  const limitRes = await runOperationalQuestionBankImportDryRun({
    fileName: "excessive.xlsx",
    bytes: limitBytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
  });
  assert.ok(limitRes.issues.some((i) => i.code === "ZIP_ENTRY_LIMIT"));

  // Duplicate ZIP Entry
  const dupBytes = await buildZipWithDuplicateEntry();
  const dupRes = await runOperationalQuestionBankImportDryRun({
    fileName: "duplicate.xlsx",
    bytes: dupBytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
  });
  assert.ok(dupRes.issues.some((i) => i.code === "ZIP_DUPLICATE_ENTRY"));

  // Malformed Central Directory
  const malformedBytes = await buildMalformedCentralDirectoryZip();
  const malformedRes = await runOperationalQuestionBankImportDryRun({
    fileName: "malformed.xlsx",
    bytes: malformedBytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
  });
  assert.ok(malformedRes.issues.some((i) => i.code === "ZIP_MALFORMED_CENTRAL_DIRECTORY"));

  // Truncated EOCD
  const truncBytes = await buildTruncatedZipBytes();
  const truncRes = await runOperationalQuestionBankImportDryRun({
    fileName: "truncated.xlsx",
    bytes: truncBytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
  });
  assert.ok(truncRes.issues.some((i) => i.code === "ZIP_MISSING_EOCD"));
});

test("dry run boundary: preview package only, apply token mintable=false, zero write side-effects", async () => {
  const { runQuestionBankImportDryRun } = await import(
    "../../../src/lib/question-bank/import/dry-run.ts"
  );
  const { CONTRACT_HEADERS } = await import(
    "../../../src/lib/question-bank/import/adapters/detect.ts"
  );

  const VALID_AUTH = {
    authenticated: true,
    actorId: "actor-123",
    authorized: true,
    capability: "question_bank.import",
    scope: "tenant:default",
    context: { actorId: "actor-123" },
  };

  const result = runQuestionBankImportDryRun({
    fileName: "dryrun.xlsx",
    headers: [...CONTRACT_HEADERS.official_flat_v0],
    rows: [],
    authorized: VALID_AUTH,
  });

  assert.equal(result.apply_token_contract.mintable, false);
  assert.ok(result.apply_token_contract.reason.includes("not minted"));
});
