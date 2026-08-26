import assert from "node:assert/strict";
import test from "node:test";
import {
  assignQuestionContentRole,
  questionsForRole,
  validateQuestionContentRole,
} from "../../../src/lib/question-bank/import/question-content-role.ts";
import {
  emptyNormalized,
  type OfficialNormalizedV1,
} from "../../../src/lib/question-bank/import/official-normalized-v1.ts";
import { adaptLessonContentQuestionV1 } from "../../../src/lib/question-bank/import/adapters/lesson-content-question-v1.ts";

function row(
  interaction: OfficialNormalizedV1["revision"]["interaction_type"],
  grading: OfficialNormalizedV1["revision"]["grading_mode"],
  withSolution = true,
): OfficialNormalizedV1 {
  return emptyNormalized({
    question_code: "Q-ROLE-1",
    revision: {
      status: "DRAFT",
      interaction_type: interaction,
      grading_mode: grading,
      educational_label: null,
      question_text: "سؤال",
      stimulus_text: null,
      max_score: 1,
      allow_partial: false,
    },
    options:
      interaction === "SINGLE_CHOICE"
        ? [
            { option_code: "A", body: "أ", sort_order: 1, is_correct: true },
            { option_code: "B", body: "ب", sort_order: 2, is_correct: false },
          ]
        : [],
    solutions: withSolution ? [{ body: "الإجابة أو الشرح" }] : [],
    provenance: { source_contract: "test", source_row: 1 },
  });
}

test("official MCQ remains an official-book question; options never reclassify it", () => {
  const officialMcq = assignQuestionContentRole(
    row("SINGLE_CHOICE", "AUTO_SINGLE"),
    "OFFICIAL_BOOK_QUESTION",
  );
  const selfTest = assignQuestionContentRole(row("SINGLE_CHOICE", "AUTO_SINGLE"), "SELF_TEST");

  assert.deepEqual(questionsForRole([officialMcq, selfTest], "OFFICIAL_BOOK_QUESTION"), [
    officialMcq,
  ]);
  assert.deepEqual(questionsForRole([officialMcq, selfTest], "SELF_TEST"), [selfTest]);
});

test("self-test rejects non-MCQ interaction even when the role says SELF_TEST", () => {
  const invalid = assignQuestionContentRole(row("LONG_TEXT", "MANUAL"), "SELF_TEST");
  const issues = validateQuestionContentRole(invalid, { requireRole: true });
  assert.ok(issues.some((entry) => entry.code === "INCOMPATIBLE_TYPE_MODE"));
});

test("official book question requires a model answer after the student attempt", () => {
  const invalid = assignQuestionContentRole(
    row("LONG_TEXT", "MANUAL", false),
    "OFFICIAL_BOOK_QUESTION",
  );
  const issues = validateQuestionContentRole(invalid, { requireRole: true });
  assert.ok(
    issues.some((entry) => entry.code === "MISSING_VALUE" && entry.column === "model_answer"),
  );
});

test("self-test requires an explanation/correction payload", () => {
  const invalid = assignQuestionContentRole(
    row("SINGLE_CHOICE", "AUTO_SINGLE", false),
    "SELF_TEST",
  );
  const issues = validateQuestionContentRole(invalid, { requireRole: true });
  assert.ok(
    issues.some((entry) => entry.code === "MISSING_VALUE" && entry.column === "explanation"),
  );
});

test("role-aware template validation fails closed when the semantic role is absent", () => {
  const issues = validateQuestionContentRole(row("SINGLE_CHOICE", "AUTO_SINGLE"), {
    requireRole: true,
  });
  assert.ok(issues.some((entry) => entry.code === "INVALID_CONTRACT"));
});

test("separate template adapter assigns role out-of-band, not from option shape", () => {
  const source = {
    question_code: "BOOK-MCQ-1",
    subject_code: "PHYS",
    lesson_code: "L1",
    prompt_kind: "اختيار_واحد",
    question_text: "سؤال اختيار كما ورد في الكتاب",
    interaction_type: "SINGLE_CHOICE",
    grading_mode: "AUTO_SINGLE",
    option_1: "أ",
    option_2: "ب",
    correct_index: 1,
    model_answer: "أ",
    explanation: "وردت الإجابة في الفقرة الأولى.",
  };
  const result = adaptLessonContentQuestionV1(source, "OFFICIAL_BOOK_QUESTION", {});
  assert.equal(result.issues.filter((entry) => entry.row_blocking).length, 0);
  assert.equal(result.row?.revision.educational_label, "OFFICIAL_BOOK_QUESTION");
  assert.equal(result.row?.answer_layer?.model_answer, "أ");
});

test("self-test adapter fixes interaction mode and retains per-option corrections", () => {
  const result = adaptLessonContentQuestionV1(
    {
      question_code: "SELF-1",
      subject_code: "PHYS",
      lesson_code: "L1",
      question_text: "اختر الإجابة الصحيحة",
      option_1: "نيوتن",
      option_2: "جول",
      correct_index: 1,
      explanation: "النيوتن وحدة القوة.",
      why_wrong_2: "الجول وحدة الطاقة.",
    },
    "SELF_TEST",
    {},
  );
  assert.equal(result.issues.filter((entry) => entry.row_blocking).length, 0);
  assert.equal(result.row?.revision.interaction_type, "SINGLE_CHOICE");
  assert.equal(result.row?.revision.educational_label, "SELF_TEST");
  assert.equal(result.row?.answer_layer?.option_rationales[0]?.option_code, "B");
});
