import assert from "node:assert/strict";
import test from "node:test";

import {
  GOLDEN_CAPABILITIES_V1,
  GOLDEN_CAPABILITIES_V2,
  GOLDEN_LESSON_SCHEMA_V1,
  GOLDEN_LESSON_SCHEMA_V2,
  type GoldenCapability,
  type GoldenLessonPackage,
} from "../../src/lib/content-factory/golden-lesson-contract.ts";
import {
  validateGoldenLessonAnswerCoverage,
  validateGoldenLessonArtifactBytes,
  validateGoldenLessonArtifactPath,
} from "../../src/lib/content-factory/golden-lesson-file-contract.ts";
import { previewGoldenLessonStaging } from "../../src/lib/content-factory/golden-lesson-staging.ts";
import { buildGoldenLessonStudentJourney } from "../../src/lib/content-factory/golden-lesson-student-view.ts";
import { validateGoldenLessonPackage } from "../../src/lib/content-factory/golden-lesson-validator.ts";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function artifact(
  capability: GoldenCapability,
  sourcePath: string | null,
  applicability: "REQUIRED" | "OPTIONAL" | "NA" = "REQUIRED",
) {
  const official = capability === "officialBookContent" || capability === "officialBookQuestions";
  return {
    capability,
    applicability,
    authority: official ? "OFFICIAL" as const : "TAMKEEN" as const,
    sourcePath,
    sha256: sourcePath ? SHA_A : null,
    provenancePath: official && sourcePath ? `${capability}-source.pdf` : null,
    provenanceSha256: official && sourcePath ? SHA_B : null,
  };
}

function packageV2(): GoldenLessonPackage {
  return {
    schema: GOLDEN_LESSON_SCHEMA_V2,
    profileId: "GOLDEN_CHEMISTRY_V2",
    packageCode: "CHEM-G12-IRON-V2",
    identity: {
      gradeCode: "G12",
      curriculumTrackCodes: ["sanaa"],
      subjectCode: "CHEM-G12",
      lessonCode: "CHEM-G12-IRON",
      lessonSlug: "iron",
      unitCode: null,
      semester: 1,
      sortOrder: 4,
    },
    capabilityOrder: [...GOLDEN_CAPABILITIES_V2],
    artifacts: [
      artifact("officialBookContent", "book.html"),
      artifact("tamkeenExplanationHtml", "explanation.html"),
      artifact("lessonSummaryHtml", "summary.html"),
      artifact("conceptsAndTermsHtml", "concepts.html"),
      artifact("equationsAndLawsHtml", null, "NA"),
      artifact("officialBookQuestions", "official-questions.json"),
      artifact("selfTest", "self-test.json"),
      artifact("interactiveActivityHtml", null, "OPTIONAL"),
    ],
    lifecycle: { initialStatus: "DRAFT", allowDirectReady: false },
    security: {
      productionApply: false,
      publicPayloadContainsAnswers: false,
      answersCompanionPath: "answers.server-only.json",
      answersCompanionSha256: SHA_B,
      htmlNetworkAccess: "NONE",
    },
  };
}

function packageV1(): GoldenLessonPackage {
  const pkg = packageV2();
  return {
    ...pkg,
    schema: GOLDEN_LESSON_SCHEMA_V1,
    profileId: "GOLDEN_CHEMISTRY_V1",
    capabilityOrder: [...GOLDEN_CAPABILITIES_V1],
    artifacts: [
      artifact("officialBookContent", "book.json"),
      artifact("tamkeenExplanationHtml", "explanation.html"),
      artifact("lessonSummaryHtml", "summary.html"),
      artifact("mindMapHtml", "mindmap.html"),
      artifact("labExperimentHtml", null, "OPTIONAL"),
      artifact("officialBookQuestions", "official-questions.json"),
      artifact("selfTest", "self-test.json"),
    ],
  };
}

test("v2 exposes the agreed eight keys while v1 remains readable", () => {
  assert.deepEqual(GOLDEN_CAPABILITIES_V2, [
    "officialBookContent",
    "tamkeenExplanationHtml",
    "lessonSummaryHtml",
    "conceptsAndTermsHtml",
    "equationsAndLawsHtml",
    "officialBookQuestions",
    "selfTest",
    "interactiveActivityHtml",
  ]);
  assert.equal(validateGoldenLessonPackage(packageV1()).valid, true);
  assert.equal(validateGoldenLessonPackage(packageV2()).valid, true);
  const activityNa = packageV2();
  activityNa.artifacts[7] = artifact("interactiveActivityHtml", null, "NA");
  assert.equal(validateGoldenLessonPackage(activityNa).valid, true);
});

test("schema/profile/capability mismatches fail closed", () => {
  const wrongProfile = { ...packageV2(), profileId: "GOLDEN_CHEMISTRY_V1" };
  assert.ok(validateGoldenLessonPackage(wrongProfile).findings.some((f) => f.code === "PROFILE_SCHEMA_MISMATCH"));

  const wrongCapability = packageV2();
  wrongCapability.artifacts[3] = artifact("mindMapHtml", "mindmap.html");
  assert.ok(validateGoldenLessonPackage(wrongCapability).findings.some((f) => f.code === "CAPABILITY_UNSUPPORTED_FOR_SCHEMA"));
});

test("official content is HTML-only in v2 without breaking v1 JSON reads", () => {
  assert.equal(validateGoldenLessonArtifactPath("officialBookContent", "book.json", GOLDEN_LESSON_SCHEMA_V1).valid, true);
  const v2 = validateGoldenLessonArtifactPath("officialBookContent", "book.json", GOLDEN_LESSON_SCHEMA_V2);
  assert.equal(v2.valid, false);
  assert.equal(v2.findings[0]?.code, "ARTIFACT_EXTENSION_FORBIDDEN");
});

test("v2 staging uses eight ordered semantic targets", () => {
  const preview = previewGoldenLessonStaging(packageV2());
  assert.equal(preview.valid, true);
  assert.equal(preview.actions.length, 8);
  assert.equal(preview.actions[3]?.target, "lesson_resources:concepts_and_terms_html");
  assert.equal(preview.actions[4]?.target, "lesson_resources:equations_and_laws_html");
  assert.equal(preview.actions[4]?.action, "SKIP_NA");
  assert.equal(preview.actions[7]?.target, "lesson_resources:interactive_activity_html");
});

test("student journey reads v1 and renders v2 READY capabilities only", () => {
  const v1 = buildGoldenLessonStudentJourney(packageV1(), new Set(["mindMapHtml"]));
  assert.deepEqual(v1.map((item) => [item.capability, item.compatibilityMode]), [["mindMapHtml", "V1_LEGACY"]]);

  const ready = new Set<GoldenCapability>(GOLDEN_CAPABILITIES_V2);
  const v2 = buildGoldenLessonStudentJourney(packageV2(), ready);
  assert.deepEqual(v2.map((item) => item.capability), [
    "officialBookContent",
    "tamkeenExplanationHtml",
    "lessonSummaryHtml",
    "conceptsAndTermsHtml",
    "officialBookQuestions",
    "selfTest",
  ]);
  assert.equal(v2.find((item) => item.capability === "officialBookQuestions")?.renderKind, "OFFICIAL_QUESTIONS");
});

test("v2 self-test requires four public options", () => {
  const publicPayload = new TextEncoder().encode(JSON.stringify({
    capability: "selfTest",
    questions: [{ id: "Q1", question: "ما الرمز؟", options: ["أ", "ب", "ج"] }],
  }));
  const result = validateGoldenLessonArtifactBytes(
    "selfTest",
    "self-test.json",
    publicPayload,
    GOLDEN_LESSON_SCHEMA_V2,
  );
  assert.ok(result.findings.some((finding) => finding.code === "SELF_TEST_OPTIONS_NOT_FOUR"));
});

test("v2 server-only answers require rationales for every wrong option", () => {
  const artifacts = {
    selfTest: {
      fileName: "self-test.json",
      bytes: new TextEncoder().encode(JSON.stringify({
        questions: [{ id: "Q1", question: "ما الرمز؟", options: ["Fe", "Cu", "Al", "Na"] }],
      })),
    },
  };
  const incomplete = new TextEncoder().encode(JSON.stringify({
    answers: [{
      capability: "selfTest",
      question_id: "Q1",
      correct_index: 1,
      explanation: "Fe هو الرمز الصحيح.",
      why_wrong_2: "هذا رمز النحاس.",
    }],
  }));
  const result = validateGoldenLessonAnswerCoverage(
    artifacts,
    { fileName: "answers.server-only.json", bytes: incomplete },
    GOLDEN_LESSON_SCHEMA_V2,
  );
  assert.equal(result.valid, false);
  assert.equal(result.findings.filter((finding) => finding.code === "SELF_TEST_WRONG_RATIONALE_MISSING").length, 2);
});
