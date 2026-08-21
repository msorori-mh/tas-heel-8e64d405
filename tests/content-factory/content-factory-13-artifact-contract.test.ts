import assert from "node:assert/strict";
import test from "node:test";

import {
  GOLDEN_ARTIFACT_FILE_CONTRACTS,
  validateGoldenLessonAnswerCoverage,
  validateGoldenLessonArtifactBytes,
  validateGoldenLessonArtifactPath,
} from "../../src/lib/content-factory/golden-lesson-file-contract.ts";

const bytes = (value: string) => new TextEncoder().encode(value);
const staticHtml = (body = "<h1>شرح</h1>") =>
  `<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;

test("every capability has an explicit, ZIP-free file contract", () => {
  assert.equal(Object.keys(GOLDEN_ARTIFACT_FILE_CONTRACTS).length, 7);
  for (const contract of Object.values(GOLDEN_ARTIFACT_FILE_CONTRACTS)) {
    assert.equal(contract.extensions.includes(".zip"), false);
  }
  assert.deepEqual(GOLDEN_ARTIFACT_FILE_CONTRACTS.labExperimentHtml.extensions, [".html"]);
  assert.deepEqual(GOLDEN_ARTIFACT_FILE_CONTRACTS.officialBookQuestions.extensions, [".json"]);
});

test("a complete package ZIP cannot be uploaded into a summary field", () => {
  assert.equal(validateGoldenLessonArtifactPath("lessonSummaryHtml", "lesson-package.zip").valid, false);
  const result = validateGoldenLessonArtifactBytes(
    "lessonSummaryHtml",
    "summary.html",
    new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]),
  );
  assert.equal(result.valid, false);
  assert.ok(result.findings.some((finding) => finding.code === "NESTED_ZIP_FORBIDDEN"));
});

test("static HTML must be RTL, responsive and script-free", () => {
  assert.equal(
    validateGoldenLessonArtifactBytes("tamkeenExplanationHtml", "explanation.html", bytes(staticHtml())).valid,
    true,
  );
  const invalid = validateGoldenLessonArtifactBytes(
    "lessonSummaryHtml",
    "summary.html",
    bytes("<html><body><script>alert(1)</script></body></html>"),
  );
  assert.equal(invalid.valid, false);
  assert.ok(invalid.findings.some((finding) => finding.code === "JS_NOT_ALLOWED_IN_STATIC_PROFILE"));
});

test("the lab accepts restricted interactive HTML", () => {
  const lab = staticHtml('<button id="run">ابدأ</button><script>document.querySelector("#run")</script>');
  assert.equal(validateGoldenLessonArtifactBytes("labExperimentHtml", "lab.html", bytes(lab)).valid, true);
});

test("official questions require original text and a stable identifier", () => {
  const missing = bytes(JSON.stringify({
    capability: "officialBookQuestions",
    questions: [{ official_text: "علل استخدام الحجر الجيري." }],
  }));
  const missingResult = validateGoldenLessonArtifactBytes(
    "officialBookQuestions",
    "official-questions.json",
    missing,
  );
  assert.equal(missingResult.valid, false);
  assert.ok(missingResult.findings.some((finding) => finding.code === "QUESTION_ID_MISSING"));

  const valid = bytes(JSON.stringify({
    capability: "officialBookQuestions",
    questions: [{ question_number: "7", official_text: "علل استخدام الحجر الجيري." }],
  }));
  assert.equal(
    validateGoldenLessonArtifactBytes("officialBookQuestions", "official-questions.json", valid).valid,
    true,
  );
});

test("self-test public content requires options and keeps answers server-only", () => {
  const missing = bytes(JSON.stringify({
    capability: "selfTest",
    questions: [{ id: "self-1", question: "ما رمز الحديد؟" }],
  }));
  const missingResult = validateGoldenLessonArtifactBytes("selfTest", "self-test.json", missing);
  assert.equal(missingResult.valid, false);
  assert.ok(missingResult.findings.some((finding) => finding.code === "SELF_TEST_OPTIONS_MISSING"));

  const valid = bytes(JSON.stringify({
    capability: "selfTest",
    questions: [{
      id: "self-1",
      question: "ما رمز الحديد؟",
      options: ["Fe", "Cu"],
    }],
  }));
  assert.equal(validateGoldenLessonArtifactBytes("selfTest", "self-test.json", valid).valid, true);

  const leaked = bytes(JSON.stringify({
    capability: "selfTest",
    questions: [{
      id: "self-1",
      question: "ما رمز الحديد؟",
      options: ["Fe", "Cu"],
      correct_index: 1,
      explanation: "Fe هو الرمز الكيميائي للحديد.",
    }],
  }));
  assert.equal(validateGoldenLessonArtifactBytes("selfTest", "self-test.json", leaked).valid, false);
});

test("a file cannot claim a different capability", () => {
  const result = validateGoldenLessonArtifactBytes(
    "selfTest",
    "self-test.json",
    bytes(JSON.stringify({
      capability: "officialBookQuestions",
      questions: [{
        id: "self-1",
        question: "سؤال",
        options: ["أ", "ب"],
      }],
    })),
  );
  assert.equal(result.valid, false);
  assert.ok(result.findings.some((finding) => finding.code === "ARTIFACT_CAPABILITY_MISMATCH"));
});

test("server-only companion must cover both question capabilities", () => {
  const artifacts = {
    officialBookQuestions: {
      fileName: "official-questions.json",
      bytes: bytes(JSON.stringify({
        capability: "officialBookQuestions",
        questions: [{ question_number: "7", official_text: "سؤال الكتاب" }],
      })),
    },
    selfTest: {
      fileName: "self-test.json",
      bytes: bytes(JSON.stringify({
        capability: "selfTest",
        questions: [{ id: "self-1", question: "اختبر فهمك", options: ["أ", "ب"] }],
      })),
    },
  };
  const incomplete = validateGoldenLessonAnswerCoverage(artifacts, {
    fileName: "answers.server-only.json",
    bytes: bytes(JSON.stringify({
      capability: "selfTest",
      answers: [{ question_id: "self-1", correct_option: "أ", rationale: "شرح" }],
    })),
  });
  assert.equal(incomplete.valid, false);
  assert.ok(incomplete.findings.some((finding) => finding.code === "ANSWER_COMPANION_COVERAGE_MISSING"));

  const complete = validateGoldenLessonAnswerCoverage(artifacts, {
    fileName: "answers.server-only.json",
    bytes: bytes(JSON.stringify({
      answers: [
        { capability: "officialBookQuestions", question_id: "7", model_answer: "الإجابة النموذجية" },
        { capability: "selfTest", question_id: "self-1", correct_option: "أ", rationale: "شرح" },
      ],
    })),
  });
  assert.equal(complete.valid, true);
});
