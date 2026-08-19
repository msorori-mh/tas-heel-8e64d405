import assert from "node:assert/strict";
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

function packageFor(profile: typeof GOLDEN_QURAN_V1 | typeof GOLDEN_CHEMISTRY_V1): GoldenLessonPackage {
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
      const official = capability === "officialBookContent" || capability === "officialBookQuestions";
      return {
        capability,
        applicability,
        authority: official ? "OFFICIAL" : "TAMKEEN",
        sourcePath: applicability === "NA" ? null : applicability === "OPTIONAL" ? null : `${capability}.json`,
        sha256: applicability === "REQUIRED" ? "a".repeat(64) : null,
        provenancePath: official && applicability === "REQUIRED" ? "provenance.json" : null,
      };
    }),
    lifecycle: { initialStatus: "DRAFT", allowDirectReady: false },
    security: {
      productionApply: false,
      publicPayloadContainsAnswers: false,
      answersCompanionPath: "answers.server-only.json",
      htmlNetworkAccess: "NONE",
    },
  };
}

test("Quran and chemistry profiles preserve the canonical seven-capability order", () => {
  assert.deepEqual(GOLDEN_QURAN_V1.capabilityOrder, GOLDEN_CAPABILITIES);
  assert.deepEqual(GOLDEN_CHEMISTRY_V1.capabilityOrder, GOLDEN_CAPABILITIES);
  assert.equal(GOLDEN_QURAN_V1.applicability.labExperimentHtml, "NA");
  assert.equal(GOLDEN_CHEMISTRY_V1.applicability.labExperimentHtml, "OPTIONAL");
});

test("valid Quran and chemistry packages pass with zero writes", () => {
  for (const profile of [GOLDEN_QURAN_V1, GOLDEN_CHEMISTRY_V1]) {
    const result = validateGoldenLessonPackage(packageFor(profile));
    assert.equal(result.valid, true, JSON.stringify(result.findings));
    assert.equal(result.writesPerformed, 0);
  }
});

test("missing required content and official provenance fail closed", () => {
  const pkg = packageFor(GOLDEN_CHEMISTRY_V1);
  const official = pkg.artifacts.find((item) => item.capability === "officialBookContent")!;
  official.sourcePath = null;
  official.sha256 = null;
  official.provenancePath = null;
  const result = validateGoldenLessonPackage(pkg);
  assert.equal(result.valid, false);
  assert.ok(result.findings.some((finding) => finding.code === "REQUIRED_ARTIFACT_MISSING"));
  assert.equal(result.writesPerformed, 0);
});

test("answers, direct READY, production apply and HTML network access are rejected", () => {
  const pkg = packageFor(GOLDEN_QURAN_V1);
  (pkg.lifecycle as { initialStatus: string }).initialStatus = "READY";
  (pkg.security as { productionApply: boolean }).productionApply = true;
  (pkg.security as { publicPayloadContainsAnswers: boolean }).publicPayloadContainsAnswers = true;
  (pkg.security as { htmlNetworkAccess: string }).htmlNetworkAccess = "OPEN";
  const result = validateGoldenLessonPackage(pkg);
  for (const code of ["LIFECYCLE_UNSAFE", "PRODUCTION_APPLY_FORBIDDEN", "ANSWER_LEAK", "HTML_NETWORK_FORBIDDEN"]) {
    assert.ok(result.findings.some((finding) => finding.code === code), code);
  }
  assert.equal(result.writesPerformed, 0);
});

test("NA capability cannot smuggle content and duplicate capability is rejected", () => {
  const pkg = packageFor(GOLDEN_QURAN_V1);
  const lab = pkg.artifacts.find((item) => item.capability === "labExperimentHtml")!;
  lab.sourcePath = "lab.html";
  lab.sha256 = "b".repeat(64);
  pkg.artifacts.push({ ...pkg.artifacts[0]! });
  const result = validateGoldenLessonPackage(pkg);
  assert.ok(result.findings.some((finding) => finding.code === "NA_ARTIFACT_HAS_CONTENT"));
  assert.ok(result.findings.some((finding) => finding.code === "CAPABILITY_DUPLICATE"));
});
