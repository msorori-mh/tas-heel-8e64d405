import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import JSZip from "jszip";

import { verifyGoldenLessonBundle } from "../../src/lib/content-factory/golden-lesson-bundle-verifier.ts";

const h = (value: string) => createHash("sha256").update(value).digest("hex");
const files = {
  "official.json": "official",
  "official.provenance.json": "official-source",
  "explanation.html": "<p>explanation</p>",
  "summary.html": "<p>summary</p>",
  "questions.json": "[]",
  "questions.provenance.json": "questions-source",
};

function manifest() {
  return {
    schema: "tamkeen.golden-lesson-package.v1", profileId: "GOLDEN_QURAN_V1", packageCode: "QURAN-G10-L01-PKG",
    identity: { gradeCode: "GRADE-10", curriculumTrackCodes: ["sanaa"], subjectCode: "QURAN-G10", lessonCode: "QURAN-G10-L01", lessonSlug: "quran-lesson", unitCode: null, semester: 1, sortOrder: 1 },
    capabilityOrder: ["officialBookContent","tamkeenExplanationHtml","lessonSummaryHtml","mindMapHtml","labExperimentHtml","officialBookQuestions","selfTest"],
    artifacts: [
      { capability: "officialBookContent", applicability: "REQUIRED", authority: "OFFICIAL", sourcePath: "official.json", sha256: h(files["official.json"]), provenancePath: "official.provenance.json", provenanceSha256: h(files["official.provenance.json"]) },
      { capability: "tamkeenExplanationHtml", applicability: "REQUIRED", authority: "TAMKEEN", sourcePath: "explanation.html", sha256: h(files["explanation.html"]), provenancePath: null, provenanceSha256: null },
      { capability: "lessonSummaryHtml", applicability: "REQUIRED", authority: "TAMKEEN", sourcePath: "summary.html", sha256: h(files["summary.html"]), provenancePath: null, provenanceSha256: null },
      { capability: "mindMapHtml", applicability: "OPTIONAL", authority: "TAMKEEN", sourcePath: null, sha256: null, provenancePath: null, provenanceSha256: null },
      { capability: "labExperimentHtml", applicability: "NA", authority: "TAMKEEN", sourcePath: null, sha256: null, provenancePath: null, provenanceSha256: null },
      { capability: "officialBookQuestions", applicability: "REQUIRED", authority: "OFFICIAL", sourcePath: "questions.json", sha256: h(files["questions.json"]), provenancePath: "questions.provenance.json", provenanceSha256: h(files["questions.provenance.json"]) },
      { capability: "selfTest", applicability: "OPTIONAL", authority: "TAMKEEN", sourcePath: null, sha256: null, provenancePath: null, provenanceSha256: null },
    ],
    lifecycle: { initialStatus: "DRAFT", allowDirectReady: false },
    security: { productionApply: false, publicPayloadContainsAnswers: false, answersCompanionPath: null, answersCompanionSha256: null, htmlNetworkAccess: "NONE" },
  };
}

async function bundle(options: { extra?: boolean; corruptHash?: boolean } = {}) {
  const zip = new JSZip();
  const value = manifest();
  if (options.corruptHash) value.artifacts[0]!.sha256 = "0".repeat(64);
  zip.file("manifest.json", JSON.stringify(value));
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  if (options.extra) zip.file("unclaimed.txt", "not in manifest");
  return new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

test("exact stored ZIP verifies every declared byte", async () => {
  const verified = await verifyGoldenLessonBundle(await bundle());
  assert.equal(verified.fileCount, 7);
  assert.match(verified.bundleSha256, /^[a-f0-9]{64}$/);
  assert.match(verified.manifestSha256, /^[a-f0-9]{64}$/);
});

test("extra files fail closed", async () => {
  await assert.rejects(async () => verifyGoldenLessonBundle(await bundle({ extra: true })), /ZIP_FILE_SET_MISMATCH/);
});

test("a declared hash mismatch fails closed", async () => {
  await assert.rejects(async () => verifyGoldenLessonBundle(await bundle({ corruptHash: true })), /ZIP_FILE_HASH_MISMATCH/);
});
