import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import JSZip from "jszip";

import { verifyGoldenLessonBundle } from "../../src/lib/content-factory/golden-lesson-bundle-verifier.ts";
import { buildGoldenDomainStageEnvelope } from "../../src/lib/content-factory/golden-lesson-domain-staging.ts";

const h = (value: string) => createHash("sha256").update(value).digest("hex");
const staticHtml = (title: string) =>
  `<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>${title}</h1></body></html>`;
const files = {
  "official.json": JSON.stringify({ blocks: [{ type: "paragraph", text: "official" }] }),
  "official.provenance.json": "official-source",
  "explanation.html": staticHtml("explanation"),
  "summary.html": staticHtml("summary"),
  "questions.json": JSON.stringify({
    capability: "officialBookQuestions",
    questions: [{ official_text: "سؤال رسمي", model_answer: "إجابة نموذجية" }],
  }),
  "questions.provenance.json": "questions-source",
};

function manifest(bundleFiles = files) {
  return {
    schema: "tamkeen.golden-lesson-package.v1", profileId: "GOLDEN_QURAN_V1", packageCode: "QURAN-G10-L01-PKG",
    identity: { gradeCode: "GRADE-10", curriculumTrackCodes: ["sanaa"], subjectCode: "QURAN-G10", lessonCode: "QURAN-G10-L01", lessonSlug: "quran-lesson", unitCode: null, semester: 1, sortOrder: 1 },
    capabilityOrder: ["officialBookContent","tamkeenExplanationHtml","lessonSummaryHtml","mindMapHtml","labExperimentHtml","officialBookQuestions","selfTest"],
    artifacts: [
      { capability: "officialBookContent", applicability: "REQUIRED", authority: "OFFICIAL", sourcePath: "official.json", sha256: h(bundleFiles["official.json"]), provenancePath: "official.provenance.json", provenanceSha256: h(bundleFiles["official.provenance.json"]) },
      { capability: "tamkeenExplanationHtml", applicability: "REQUIRED", authority: "TAMKEEN", sourcePath: "explanation.html", sha256: h(bundleFiles["explanation.html"]), provenancePath: null, provenanceSha256: null },
      { capability: "lessonSummaryHtml", applicability: "REQUIRED", authority: "TAMKEEN", sourcePath: "summary.html", sha256: h(bundleFiles["summary.html"]), provenancePath: null, provenanceSha256: null },
      { capability: "mindMapHtml", applicability: "OPTIONAL", authority: "TAMKEEN", sourcePath: null, sha256: null, provenancePath: null, provenanceSha256: null },
      { capability: "labExperimentHtml", applicability: "NA", authority: "TAMKEEN", sourcePath: null, sha256: null, provenancePath: null, provenanceSha256: null },
      { capability: "officialBookQuestions", applicability: "REQUIRED", authority: "OFFICIAL", sourcePath: "questions.json", sha256: h(bundleFiles["questions.json"]), provenancePath: "questions.provenance.json", provenanceSha256: h(bundleFiles["questions.provenance.json"]) },
      { capability: "selfTest", applicability: "OPTIONAL", authority: "TAMKEEN", sourcePath: null, sha256: null, provenancePath: null, provenanceSha256: null },
    ],
    lifecycle: { initialStatus: "DRAFT", allowDirectReady: false },
    security: { productionApply: false, publicPayloadContainsAnswers: false, answersCompanionPath: null, answersCompanionSha256: null, htmlNetworkAccess: "NONE" },
  };
}

async function bundle(options: { extra?: boolean; corruptHash?: boolean; invalidQuestions?: boolean } = {}) {
  const zip = new JSZip();
  const bundleFiles = {
    ...files,
    ...(options.invalidQuestions ? {
      "questions.json": JSON.stringify({
        capability: "officialBookQuestions",
        questions: [{ official_text: "سؤال بلا إجابة" }],
      }),
    } : {}),
  };
  const value = manifest(bundleFiles);
  if (options.corruptHash) value.artifacts[0]!.sha256 = "0".repeat(64);
  zip.file("manifest.json", JSON.stringify(value));
  for (const [name, content] of Object.entries(bundleFiles)) zip.file(name, content);
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

test("valid hashes cannot hide semantically incomplete question content", async () => {
  await assert.rejects(
    async () => verifyGoldenLessonBundle(await bundle({ invalidQuestions: true })),
    /MODEL_ANSWER_MISSING/,
  );
});

test("verified bytes map deterministically to seven domain staging targets", async () => {
  const verified = await verifyGoldenLessonBundle(await bundle());
  const envelope = buildGoldenDomainStageEnvelope(verified);
  assert.equal(envelope.entries.length, 7);
  assert.equal(envelope.entries[0]?.targetPlan, "lesson_book_contents");
  assert.equal(envelope.entries[2]?.lifecycleCapability, "quickReview");
  assert.equal(envelope.entries[4]?.targetPlan, "lesson_resources:experiment");
  assert.equal(envelope.entries[0]?.sourceBase64, Buffer.from(files["official.json"]).toString("base64"));
  assert.equal(envelope.answersCompanion, null);
});
