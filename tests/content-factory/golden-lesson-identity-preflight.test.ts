import assert from "node:assert/strict";
import test from "node:test";

import type { GoldenLessonIdentity } from "../../src/lib/content-factory/golden-lesson-contract.ts";
import {
  canRebindGoldenLessonDraft,
  canonicalGoldenLessonIdentity,
  describeGoldenIdentityConflictAr,
  diffGoldenLessonIdentity,
  stableGoldenLessonIdentityMatches,
} from "../../src/lib/content-factory/golden-lesson-identity-preflight.ts";

const base: GoldenLessonIdentity = {
  gradeCode: "G12",
  curriculumTrackCodes: ["sanaa", "aden"],
  subjectCode: "CHEMISTRY",
  lessonCode: "IRON",
  lessonSlug: "iron",
  unitCode: null,
  semester: 1,
  sortOrder: 4,
};

test("canonical identity ignores track order, case, whitespace and duplicates", () => {
  const incoming: GoldenLessonIdentity = {
    ...base,
    gradeCode: " g12 ",
    subjectCode: "chemistry",
    curriculumTrackCodes: ["ADEN", " sanaa ", "aden"],
  };
  assert.deepEqual(canonicalGoldenLessonIdentity(incoming), {
    ...base,
    curriculumTrackCodes: ["aden", "sanaa"],
  });
  assert.deepEqual(diffGoldenLessonIdentity(base, incoming), []);
});

test("unreviewed DRAFT can correct routing metadata when stable lesson key matches", () => {
  const incoming: GoldenLessonIdentity = {
    ...base,
    curriculumTrackCodes: ["aden", "sanaa"],
    unitCode: "unit-1",
    semester: 2,
    sortOrder: 5,
  };
  assert.equal(stableGoldenLessonIdentityMatches(base, incoming), true);
  assert.equal(canRebindGoldenLessonDraft({
    current: base,
    incoming,
    profileMatches: true,
    reviewStatus: "DRAFT",
    reviewCount: 0,
    domainBatchCount: 0,
  }), true);
  assert.deepEqual(diffGoldenLessonIdentity(base, incoming).map((item) => item.field), [
    "unitCode",
    "semester",
    "sortOrder",
  ]);
});

test("stable lesson key changes are never rebindable", () => {
  const incoming = { ...base, lessonCode: "COPPER", lessonSlug: "copper" };
  assert.equal(stableGoldenLessonIdentityMatches(base, incoming), false);
  assert.equal(canRebindGoldenLessonDraft({
    current: base,
    incoming,
    profileMatches: true,
    reviewStatus: "DRAFT",
    reviewCount: 0,
    domainBatchCount: 0,
  }), false);
});

test("reviewed, non-DRAFT or domain-staged packages remain immutable", () => {
  const incoming = { ...base, unitCode: "unit-1" };
  for (const blocked of [
    { reviewStatus: "SUBMITTED", reviewCount: 0, domainBatchCount: 0 },
    { reviewStatus: "DRAFT", reviewCount: 1, domainBatchCount: 0 },
    { reviewStatus: "DRAFT", reviewCount: 0, domainBatchCount: 1 },
  ]) {
    assert.equal(canRebindGoldenLessonDraft({
      current: base,
      incoming,
      profileMatches: true,
      ...blocked,
    }), false);
  }
});

test("Arabic conflict description names the exact changed fields", () => {
  const text = describeGoldenIdentityConflictAr(diffGoldenLessonIdentity(base, {
    ...base,
    unitCode: "unit-1",
    sortOrder: 6,
  }));
  assert.match(text, /الوحدة/);
  assert.match(text, /ترتيب الدرس/);
  assert.match(text, /unit-1/);
});
