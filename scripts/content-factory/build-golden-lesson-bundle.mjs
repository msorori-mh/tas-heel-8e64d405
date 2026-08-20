#!/usr/bin/env node
/**
 * Deterministic Golden Lesson bundle builder.
 *
 * Reads `golden-bundle.spec.json` from a content package directory, computes the
 * SHA-256 of every leaf artifact, emits a contract-valid `manifest.json`, and packs
 * the exact file set into a ZIP that `verifyGoldenLessonBundle` accepts.
 *
 * This script performs ZERO database or network writes. It is the repeatable entry
 * point the content team uses before any Content Factory upload.
 *
 *   node scripts/content-factory/build-golden-lesson-bundle.mjs content-packages/<pkg>
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import JSZip from "jszip";

const GOLDEN_LESSON_SCHEMA = "tamkeen.golden-lesson-package.v1";

const CAPABILITY_ORDER = [
  "officialBookContent",
  "tamkeenExplanationHtml",
  "lessonSummaryHtml",
  "mindMapHtml",
  "labExperimentHtml",
  "officialBookQuestions",
  "selfTest",
];

const AUTHORITY = {
  officialBookContent: "OFFICIAL",
  tamkeenExplanationHtml: "TAMKEEN",
  lessonSummaryHtml: "TAMKEEN",
  mindMapHtml: "TAMKEEN",
  labExperimentHtml: "TAMKEEN",
  officialBookQuestions: "OFFICIAL",
  selfTest: "TAMKEEN",
};

const PROFILE_APPLICABILITY = {
  GOLDEN_CHEMISTRY_V1: {
    officialBookContent: "REQUIRED",
    tamkeenExplanationHtml: "REQUIRED",
    lessonSummaryHtml: "REQUIRED",
    mindMapHtml: "REQUIRED",
    labExperimentHtml: "OPTIONAL",
    officialBookQuestions: "REQUIRED",
    selfTest: "REQUIRED",
  },
  GOLDEN_QURAN_V1: {
    officialBookContent: "REQUIRED",
    tamkeenExplanationHtml: "REQUIRED",
    lessonSummaryHtml: "REQUIRED",
    mindMapHtml: "OPTIONAL",
    labExperimentHtml: "NA",
    officialBookQuestions: "REQUIRED",
    selfTest: "OPTIONAL",
  },
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function buildGoldenLessonBundleFiles(packageDir, spec) {
  const applicability = PROFILE_APPLICABILITY[spec.profileId];
  if (!applicability) throw new Error(`PROFILE_UNKNOWN:${spec.profileId}`);

  /** @type {Map<string, Uint8Array>} */
  const files = new Map();
  const read = (leaf) => {
    if (leaf === null) return null;
    if (leaf.includes("/") || leaf.includes("\\")) throw new Error(`PACKAGE_PATH_UNSAFE:${leaf}`);
    const bytes = new Uint8Array(readFileSync(join(packageDir, leaf)));
    files.set(leaf, bytes);
    return sha256(bytes);
  };

  const artifacts = CAPABILITY_ORDER.map((capability) => {
    const entry = spec.artifacts[capability] ?? { sourcePath: null, provenancePath: null };
    const applies = applicability[capability];
    if (applies === "NA") {
      return {
        capability,
        applicability: applies,
        authority: AUTHORITY[capability],
        sourcePath: null,
        sha256: null,
        provenancePath: null,
        provenanceSha256: null,
      };
    }
    return {
      capability,
      applicability: applies,
      authority: AUTHORITY[capability],
      sourcePath: entry.sourcePath ?? null,
      sha256: read(entry.sourcePath ?? null),
      provenancePath: entry.provenancePath ?? null,
      provenanceSha256: read(entry.provenancePath ?? null),
    };
  });

  const answersCompanionPath = spec.answersCompanionPath ?? null;
  const answersCompanionSha256 = read(answersCompanionPath);

  const manifest = {
    schema: GOLDEN_LESSON_SCHEMA,
    profileId: spec.profileId,
    packageCode: spec.packageCode,
    identity: {
      gradeCode: spec.identity.gradeCode,
      curriculumTrackCodes: [...spec.identity.curriculumTrackCodes].sort(),
      subjectCode: spec.identity.subjectCode,
      lessonCode: spec.identity.lessonCode,
      lessonSlug: spec.identity.lessonSlug,
      unitCode: spec.identity.unitCode ?? null,
      semester: spec.identity.semester ?? null,
      sortOrder: spec.identity.sortOrder ?? null,
    },
    capabilityOrder: [...CAPABILITY_ORDER],
    artifacts,
    lifecycle: { initialStatus: "DRAFT", allowDirectReady: false },
    security: {
      productionApply: false,
      publicPayloadContainsAnswers: false,
      answersCompanionPath,
      answersCompanionSha256,
      htmlNetworkAccess: "NONE",
    },
  };

  return { manifest, files };
}

export async function packGoldenLessonBundle(manifest, files) {
  const zip = new JSZip();
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestBytes = new TextEncoder().encode(manifestText);
  const epoch = new Date(Date.UTC(2020, 0, 1, 0, 0, 0));
  zip.file("manifest.json", manifestBytes, { date: epoch, createFolders: false });
  for (const leaf of [...files.keys()].sort()) {
    zip.file(leaf, files.get(leaf), { date: epoch, createFolders: false });
  }
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  });
  return { bytes, manifestText, manifestSha256: sha256(manifestBytes) };
}

async function main() {
  const packageDir = resolve(process.argv[2] ?? "");
  if (!process.argv[2]) throw new Error("USAGE: build-golden-lesson-bundle.mjs <package-dir>");
  const spec = JSON.parse(readFileSync(join(packageDir, "golden-bundle.spec.json"), "utf8"));
  const { manifest, files } = buildGoldenLessonBundleFiles(packageDir, spec);
  const { bytes, manifestText, manifestSha256 } = await packGoldenLessonBundle(manifest, files);

  const distDir = join(packageDir, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "golden-manifest.json"), manifestText);
  const zipPath = join(distDir, `${manifest.packageCode}.zip`);
  writeFileSync(zipPath, bytes);

  process.stdout.write(
    `${JSON.stringify(
      {
        packageCode: manifest.packageCode,
        zipPath,
        fileCount: files.size + 1,
        compressedBytes: bytes.byteLength,
        manifestSha256,
        bundleSha256: sha256(bytes),
        writesPerformed: 0,
      },
      null,
      2,
    )}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
