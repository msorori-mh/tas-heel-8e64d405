import assert from "node:assert/strict";
import { test } from "node:test";

import { GOLDEN_CAPABILITIES, GOLDEN_LESSON_SCHEMA, type GoldenLessonPackage } from "../../src/lib/content-factory/golden-lesson-contract.ts";
import { GOLDEN_QURAN_V1 } from "../../src/lib/content-factory/golden-lesson-profiles.ts";
import { evaluateGoldenReviewTransition, type GoldenReviewEvidence } from "../../src/lib/content-factory/golden-lesson-review.ts";
import { parseGoldenLessonManifest, previewGoldenLessonStaging } from "../../src/lib/content-factory/golden-lesson-staging.ts";

function validPackage(): GoldenLessonPackage {
  return {
    schema: GOLDEN_LESSON_SCHEMA,
    profileId: GOLDEN_QURAN_V1.id,
    packageCode: "QURAN-G10-L01-PKG",
    identity: { gradeCode: "GRADE-10", curriculumTrackCodes: ["sanaa"], subjectCode: "QURAN-G10", lessonCode: "QURAN-G10-L01", lessonSlug: "quran-lesson", unitCode: null, semester: 1, sortOrder: 1 },
    capabilityOrder: [...GOLDEN_CAPABILITIES],
    artifacts: GOLDEN_CAPABILITIES.map((capability) => {
      const applicability = GOLDEN_QURAN_V1.applicability[capability];
      const authority = capability === "officialBookContent" || capability === "officialBookQuestions" ? "OFFICIAL" : "TAMKEEN";
      const sourceExtension = capability === "tamkeenExplanationHtml" || capability === "lessonSummaryHtml" || capability === "mindMapHtml"
        ? "html"
        : "json";
      const sourcePath = applicability === "REQUIRED" ? `${capability}.${sourceExtension}` : null;
      return { capability, applicability, authority, sourcePath, sha256: sourcePath ? "a".repeat(64) : null, provenancePath: authority === "OFFICIAL" && sourcePath ? `${capability}.provenance.json` : null, provenanceSha256: authority === "OFFICIAL" && sourcePath ? "c".repeat(64) : null };
    }),
    lifecycle: { initialStatus: "DRAFT", allowDirectReady: false },
    security: { productionApply: false, publicPayloadContainsAnswers: false, answersCompanionPath: "answers.server-only.json", answersCompanionSha256: "b".repeat(64), htmlNetworkAccess: "NONE" },
  };
}

test("valid manifest produces a deterministic seven-capability plan with zero writes", () => {
  const parsed = parseGoldenLessonManifest(JSON.stringify(validPackage()));
  const preview = previewGoldenLessonStaging(parsed);
  assert.equal(preview.valid, true, JSON.stringify(preview.findings));
  assert.equal(preview.actions.length, 7);
  assert.equal(preview.stagedDraftsPlanned, 6);
  assert.equal(preview.domainWritesPerformed, 0);
  assert.equal(preview.productionWritesPerformed, 0);
  assert.equal(preview.executable, false);
});

test("invalid JSON and malformed manifests fail closed", () => {
  assert.throws(() => parseGoldenLessonManifest("{"), /MANIFEST_JSON_INVALID/);
  const preview = previewGoldenLessonStaging({ schema: GOLDEN_LESSON_SCHEMA });
  assert.equal(preview.valid, false);
  assert.equal(preview.actions.length, 0);
  assert.equal(preview.productionWritesPerformed, 0);
});

test("review workflow enforces role and evidence without persistence", () => {
  const evidence: GoldenReviewEvidence = { packageValidationPassed: true, officialProvenanceChecked: false, answerSeparationChecked: false, responsivePreviewChecked: false };
  assert.equal(evaluateGoldenReviewTransition("DRAFT", "SUBMITTED", "CONTENT_REVIEWER", evidence).code, "ROLE_FORBIDDEN");
  const submitted = evaluateGoldenReviewTransition("DRAFT", "SUBMITTED", "CONTENT_EDITOR", evidence);
  assert.equal(submitted.allowed, true);
  assert.equal(submitted.writesPerformed, 0);
  const blocked = evaluateGoldenReviewTransition("SUBMITTED", "CONTENT_APPROVED", "CONTENT_REVIEWER", evidence);
  assert.equal(blocked.code, "EVIDENCE_MISSING");
  assert.deepEqual(blocked.missingEvidence, ["officialProvenanceChecked", "answerSeparationChecked"]);
});

test("review workflow rejects skips and keeps final approval non-executable", () => {
  const evidence: GoldenReviewEvidence = { packageValidationPassed: true, officialProvenanceChecked: true, answerSeparationChecked: true, responsivePreviewChecked: true };
  assert.equal(evaluateGoldenReviewTransition("DRAFT", "APPROVED_FOR_STAGING", "TECHNICAL_REVIEWER", evidence).code, "TRANSITION_INVALID");
  const final = evaluateGoldenReviewTransition("CONTENT_APPROVED", "APPROVED_FOR_STAGING", "TECHNICAL_REVIEWER", evidence);
  assert.equal(final.allowed, true);
  assert.equal(final.nextStatus, "APPROVED_FOR_STAGING");
  assert.equal(final.writesPerformed, 0);
});
