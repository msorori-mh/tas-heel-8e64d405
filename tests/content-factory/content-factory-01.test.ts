import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  GOLDEN_CAPABILITIES,
  GOLDEN_LESSON_SCHEMA,
  type GoldenLessonPackage,
} from "../../src/lib/content-factory/golden-lesson-contract.ts";
import {
  GOLDEN_CHEMISTRY_V1,
  GOLDEN_QURAN_V1,
} from "../../src/lib/content-factory/golden-lesson-profiles.ts";
import { validateGoldenLessonPackage } from "../../src/lib/content-factory/golden-lesson-validator.ts";

const REQUIRED_OFFICIAL_QUESTIONS_MIGRATION = readFileSync(
  "supabase/migrations/20260827030000_golden_lesson_required_official_questions.sql",
  "utf8",
);

function packageFor(
  profile: typeof GOLDEN_QURAN_V1 | typeof GOLDEN_CHEMISTRY_V1,
): GoldenLessonPackage {
  return {
    schema: GOLDEN_LESSON_SCHEMA,
    profileId: profile.id,
    packageCode: "TEST-GOLDEN-LESSON",
    identity: {
      gradeCode: "GRADE-10",
      curriculumTrackCodes: ["sanaa"],
      subjectCode: profile.subjectFamily === "QURAN" ? "QURAN-G10" : "CHEM-G12",
      lessonCode: profile.subjectFamily === "QURAN" ? "QURAN-G10-L01" : "CHEM-G12-IRON-FE",
      lessonSlug: "golden-lesson",
      unitCode: null,
      semester: 1,
      sortOrder: 1,
    },
    capabilityOrder: [...GOLDEN_CAPABILITIES],
    artifacts: GOLDEN_CAPABILITIES.map((capability) => {
      const applicability = profile.applicability[capability];
      const official =
        capability === "officialBookContent" || capability === "officialBookQuestions";
      const sourcePath =
        applicability === "REQUIRED"
          ? [
              "officialBookContent",
              "tamkeenExplanationHtml",
              "lessonSummaryHtml",
              "mindMapHtml",
              "labExperimentHtml",
            ].includes(capability)
            ? `${capability}.html`
            : `${capability}.json`
          : null;
      return {
        capability,
        applicability,
        authority: official ? "OFFICIAL" : "TAMKEEN",
        sourcePath,
        sha256: sourcePath ? "a".repeat(64) : null,
        provenancePath: official && sourcePath ? `${capability}.provenance.json` : null,
        provenanceSha256: official && sourcePath ? "b".repeat(64) : null,
      };
    }),
    lifecycle: { initialStatus: "DRAFT", allowDirectReady: false },
    security: {
      productionApply: false,
      publicPayloadContainsAnswers: false,
      answersCompanionPath: "answers.server-only.json",
      answersCompanionSha256: "c".repeat(64),
      htmlNetworkAccess: "NONE",
    },
  };
}

test("Quran and chemistry profiles preserve the canonical seven-capability order", () => {
  assert.deepEqual(GOLDEN_QURAN_V1.capabilityOrder, GOLDEN_CAPABILITIES);
  assert.deepEqual(GOLDEN_CHEMISTRY_V1.capabilityOrder, GOLDEN_CAPABILITIES);
  assert.equal(GOLDEN_QURAN_V1.applicability.labExperimentHtml, "OPTIONAL");
  assert.equal(GOLDEN_CHEMISTRY_V1.applicability.labExperimentHtml, "OPTIONAL");
  assert.equal(GOLDEN_QURAN_V1.applicability.officialBookQuestions, "REQUIRED");
  assert.equal(GOLDEN_CHEMISTRY_V1.applicability.officialBookQuestions, "REQUIRED");
  assert.equal(GOLDEN_QURAN_V1.applicability.selfTest, "REQUIRED");
  assert.equal(GOLDEN_CHEMISTRY_V1.applicability.selfTest, "REQUIRED");
});

test("package identity and the server-only answers companion fail closed", () => {
  const pkg = packageFor(GOLDEN_QURAN_V1);
  pkg.packageCode = "";
  pkg.security.answersCompanionSha256 = null;
  const result = validateGoldenLessonPackage(pkg);
  assert.ok(result.findings.some((finding) => finding.code === "PACKAGE_CODE_INVALID"));
  assert.ok(result.findings.some((finding) => finding.code === "ANSWER_COMPANION_HASH_INVALID"));
  assert.equal(result.writesPerformed, 0);
});

test("valid Quran and chemistry packages pass with zero writes", () => {
  for (const profile of [GOLDEN_QURAN_V1, GOLDEN_CHEMISTRY_V1]) {
    const result = validateGoldenLessonPackage(packageFor(profile));
    assert.equal(result.valid, true, JSON.stringify(result.findings));
    assert.equal(result.writesPerformed, 0);
  }
});

test("a capability with no file yet does not hold back the rest of the package", () => {
  const pkg = packageFor(GOLDEN_CHEMISTRY_V1);
  const official = pkg.artifacts.find((item) => item.capability === "officialBookContent")!;
  official.sourcePath = null;
  official.sha256 = null;
  official.provenancePath = null;
  official.provenanceSha256 = null;
  const result = validateGoldenLessonPackage(pkg);
  assert.equal(result.valid, true, JSON.stringify(result.findings));
  assert.equal(
    result.findings.some((finding) => finding.code === "REQUIRED_ARTIFACT_MISSING"),
    false,
  );
  assert.equal(result.writesPerformed, 0);
});

test("official provenance is still mandatory for an official capability that has a file", () => {
  const pkg = packageFor(GOLDEN_CHEMISTRY_V1);
  const official = pkg.artifacts.find((item) => item.capability === "officialBookContent")!;
  official.provenancePath = null;
  official.provenanceSha256 = null;
  const result = validateGoldenLessonPackage(pkg);
  assert.equal(result.valid, false);
  assert.ok(result.findings.some((finding) => finding.code === "OFFICIAL_PROVENANCE_MISSING"));
  assert.equal(result.writesPerformed, 0);
});

test("a package carrying no file at all has nothing to publish", () => {
  const pkg = packageFor(GOLDEN_CHEMISTRY_V1);
  for (const artifact of pkg.artifacts) {
    artifact.sourcePath = null;
    artifact.sha256 = null;
    artifact.provenancePath = null;
    artifact.provenanceSha256 = null;
  }
  const result = validateGoldenLessonPackage(pkg);
  assert.equal(result.valid, false);
  assert.ok(result.findings.some((finding) => finding.code === "PACKAGE_HAS_NO_CONTENT"));
  assert.equal(result.writesPerformed, 0);
});

test("any single capability on its own is a publishable package", () => {
  for (const only of GOLDEN_CAPABILITIES) {
    const pkg = packageFor(GOLDEN_CHEMISTRY_V1);
    for (const artifact of pkg.artifacts) {
      if (artifact.capability === only) continue;
      artifact.sourcePath = null;
      artifact.sha256 = null;
      artifact.provenancePath = null;
      artifact.provenanceSha256 = null;
    }
    const kept = pkg.artifacts.find((item) => item.capability === only)!;
    if (!kept.sourcePath) continue; // labExperimentHtml carries no file in this fixture
    const result = validateGoldenLessonPackage(pkg);
    assert.equal(result.valid, true, `${only}: ${JSON.stringify(result.findings)}`);
  }
});

test("answers, direct READY, production apply and HTML network access are rejected", () => {
  const pkg = packageFor(GOLDEN_QURAN_V1);
  (pkg.lifecycle as { initialStatus: string }).initialStatus = "READY";
  (pkg.security as { productionApply: boolean }).productionApply = true;
  (pkg.security as { publicPayloadContainsAnswers: boolean }).publicPayloadContainsAnswers = true;
  (pkg.security as { htmlNetworkAccess: string }).htmlNetworkAccess = "OPEN";
  const result = validateGoldenLessonPackage(pkg);
  for (const code of [
    "LIFECYCLE_UNSAFE",
    "PRODUCTION_APPLY_FORBIDDEN",
    "ANSWER_LEAK",
    "HTML_NETWORK_FORBIDDEN",
  ]) {
    assert.ok(
      result.findings.some((finding) => finding.code === code),
      code,
    );
  }
  assert.equal(result.writesPerformed, 0);
});

test("optional lab may be absent, while partial artifacts and duplicate capabilities fail closed", () => {
  const pkg = packageFor(GOLDEN_QURAN_V1);
  const lab = pkg.artifacts.find((item) => item.capability === "labExperimentHtml")!;
  lab.sourcePath = "lab.html";
  lab.sha256 = null;
  pkg.artifacts.push({ ...pkg.artifacts[0]! });
  const result = validateGoldenLessonPackage(pkg);
  assert.ok(result.findings.some((finding) => finding.code === "ARTIFACT_HASH_INVALID"));
  assert.ok(result.findings.some((finding) => finding.code === "CAPABILITY_DUPLICATE"));
});

test("database validation requires book questions without blindly rewriting lesson evidence", () => {
  assert.match(
    REQUIRED_OFFICIAL_QUESTIONS_MIGRATION,
    /WHEN capability = 'labExperimentHtml' THEN 'OPTIONAL'/,
  );
  assert.doesNotMatch(
    REQUIRED_OFFICIAL_QUESTIONS_MIGRATION,
    /labExperimentHtml','officialBookQuestions'\) THEN 'OPTIONAL'/,
  );
  assert.doesNotMatch(
    REQUIRED_OFFICIAL_QUESTIONS_MIGRATION,
    /UPDATE\s+public\.lesson_capability_lifecycle/i,
  );
});
