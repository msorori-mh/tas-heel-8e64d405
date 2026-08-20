import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildGoldenLessonBundleFiles,
  packGoldenLessonBundle,
} from "../../scripts/content-factory/build-golden-lesson-bundle.mjs";
import { verifyGoldenLessonBundle } from "../../src/lib/content-factory/golden-lesson-bundle-verifier";
import { GOLDEN_CAPABILITIES } from "../../src/lib/content-factory/golden-lesson-contract";
import { previewGoldenLessonStaging } from "../../src/lib/content-factory/golden-lesson-staging";
import { validateGoldenLessonPackage } from "../../src/lib/content-factory/golden-lesson-validator";

const PACKAGE_DIR = resolve(__dirname, "../../content-packages/chemistry-g12-iron-v3");
const spec = JSON.parse(readFileSync(resolve(PACKAGE_DIR, "golden-bundle.spec.json"), "utf8"));

describe("chemistry-g12-iron golden bundle", () => {
  const { manifest, files } = buildGoldenLessonBundleFiles(PACKAGE_DIR, spec);

  it("declares the evidence-backed production identity", () => {
    expect(manifest.profileId).toBe("GOLDEN_CHEMISTRY_V1");
    expect(manifest.packageCode).toBe("CHEM-G12-IRON-FE");
    expect(manifest.identity).toMatchObject({
      gradeCode: "GRADE-12",
      subjectCode: "SUB-G12-012",
      lessonCode: "CHEM-G12-IRON-FE",
      lessonSlug: "الحديد-fe",
      unitCode: null,
      semester: 1,
      sortOrder: 4,
    });
    expect(manifest.identity.curriculumTrackCodes).toEqual(["aden", "sanaa"]);
  });

  it("keeps the lab experiment OPTIONAL per profile while still shipping bytes", () => {
    const lab = manifest.artifacts.find((a) => a.capability === "labExperimentHtml");
    expect(lab?.applicability).toBe("OPTIONAL");
    expect(lab?.sourcePath).toBe("lab.html");
    expect(lab?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is fail-closed on security flags", () => {
    expect(manifest.lifecycle).toEqual({ initialStatus: "DRAFT", allowDirectReady: false });
    expect(manifest.security.productionApply).toBe(false);
    expect(manifest.security.publicPayloadContainsAnswers).toBe(false);
    expect(manifest.security.htmlNetworkAccess).toBe("NONE");
    expect(manifest.security.answersCompanionPath).toBe("answer-companion.server-only.json");
  });

  it("passes the contract validator with zero findings", () => {
    const result = validateGoldenLessonPackage(manifest);
    expect(result.findings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.writesPerformed).toBe(0);
  });

  it("plans a staged draft for all seven capabilities", () => {
    const preview = previewGoldenLessonStaging(manifest);
    expect(preview.valid).toBe(true);
    expect(preview.stagedDraftsPlanned).toBe(GOLDEN_CAPABILITIES.length);
    expect(preview.domainWritesPerformed).toBe(0);
    expect(preview.productionWritesPerformed).toBe(0);
  });

  it("packs a ZIP the server verifier accepts", async () => {
    const { bytes } = await packGoldenLessonBundle(manifest, files);
    const verified = await verifyGoldenLessonBundle(bytes);
    expect(verified.fileCount).toBe(files.size + 1);
    expect(verified.manifest.packageCode).toBe("CHEM-G12-IRON-FE");
    expect(verified.bundleSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("carries only safe leaf file names", () => {
    for (const leaf of files.keys()) {
      expect(leaf).not.toMatch(/[\\/]/);
    }
  });
});
