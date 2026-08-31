import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOfflineScopeKey,
  estimateOfflinePackageBytes,
  validateOfflineContentPackage,
  type OfflineContentPackage,
} from "./offline/content-package";

function samplePackage(): OfflineContentPackage {
  return {
    packageId: "grade12-sanaa-s1-chemistry",
    schemaVersion: 1,
    revision: "2026.08.31.1",
    generatedAt: "2026-08-31T00:00:00.000Z",
    scope: {
      gradeId: "grade-12",
      curriculumTrack: "sanaa",
      semester: "s1",
      subjectId: "chemistry",
    },
    entries: [
      {
        contentKey: "lesson:chemistry:001",
        kind: "lesson",
        version: "1",
        payload: { title: "الدرس الأول" },
      },
      {
        contentKey: "self-test:chemistry:001",
        kind: "self_test",
        version: "1",
        payload: { questionCount: 10 },
      },
    ],
    assets: [
      {
        assetId: "asset:chemistry:001:html",
        ownerContentKey: "lesson:chemistry:001",
        fileKind: "html",
        version: "1",
        byteSize: 1024,
      },
      {
        assetId: "asset:chemistry:001:mindmap",
        ownerContentKey: "lesson:chemistry:001",
        fileKind: "mind_map",
        version: "1",
        byteSize: null,
      },
    ],
  };
}

test("offline scope key distinguishes curriculum track and semester", () => {
  assert.equal(
    buildOfflineScopeKey({
      gradeId: "grade-12",
      curriculumTrack: "aden",
      semester: "s2",
      subjectId: "chemistry",
    }),
    "grade:grade-12:track:aden:semester:s2:subject:chemistry",
  );
});

test("valid offline package passes with known and unknown asset sizes", () => {
  const pkg = samplePackage();
  assert.equal(validateOfflineContentPackage(pkg), pkg);
  assert.deepEqual(estimateOfflinePackageBytes(pkg), {
    knownBytes: 1024,
    unknownAssets: 1,
  });
});

test("duplicate content keys are rejected", () => {
  const pkg = samplePackage();
  pkg.entries.push({ ...pkg.entries[0] });
  assert.throws(() => validateOfflineContentPackage(pkg), /duplicate_content_key/);
});

test("asset cannot reference content outside its package", () => {
  const pkg = samplePackage();
  pkg.assets[0] = { ...pkg.assets[0], ownerContentKey: "lesson:missing" };
  assert.throws(() => validateOfflineContentPackage(pkg), /asset_owner_missing/);
});
