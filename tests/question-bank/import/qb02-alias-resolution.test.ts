import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCurriculumAlias,
  validateCurriculumAliases,
  buildAliasMap,
  createCurriculumSnapshot,
} from "../../../src/lib/question-bank/import/curriculum-lookup.ts";

test("Curriculum Alias Resolution (Case 1): self-alias returns SELF_ALIAS error", () => {
  const aliases = new Map<string, string>([["MATH-G10", "MATH-G10"]]);
  const validTargets = new Set(["MATH-G10"]);

  const res = resolveCurriculumAlias("MATH-G10", aliases, validTargets);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error, "SELF_ALIAS");
    assert.deepEqual(res.path, ["MATH-G10", "MATH-G10"]);
  }
});

test("Curriculum Alias Resolution (Case 2): direct cycle returns ALIAS_CYCLE error", () => {
  const directCycle = new Map<string, string>([
    ["SUBJ-A", "SUBJ-B"],
    ["SUBJ-B", "SUBJ-A"],
  ]);

  const res1 = resolveCurriculumAlias("SUBJ-A", directCycle);
  assert.equal(res1.ok, false);
  if (!res1.ok) {
    assert.equal(res1.error, "ALIAS_CYCLE");
    assert.deepEqual(res1.path, ["SUBJ-A", "SUBJ-B", "SUBJ-A"]);
  }
});

test("Curriculum Alias Resolution (Case 3): indirect cycle returns ALIAS_CYCLE error", () => {
  const indirectCycle = new Map<string, string>([
    ["ALIAS-1", "ALIAS-2"],
    ["ALIAS-2", "ALIAS-3"],
    ["ALIAS-3", "ALIAS-1"],
  ]);

  const res2 = resolveCurriculumAlias("ALIAS-1", indirectCycle);
  assert.equal(res2.ok, false);
  if (!res2.ok) {
    assert.equal(res2.error, "ALIAS_CYCLE");
    assert.deepEqual(res2.path, ["ALIAS-1", "ALIAS-2", "ALIAS-3", "ALIAS-1"]);
  }
});

test("Curriculum Alias Resolution (Case 4): missing target returns MISSING_ALIAS_TARGET error", () => {
  const aliases = new Map<string, string>([["OLD-MATH-G10", "MISSING-MATH-TARGET"]]);
  const validTargets = new Set(["MATH-G10", "PHYS-G10"]);

  const res = resolveCurriculumAlias("OLD-MATH-G10", aliases, validTargets);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error, "MISSING_ALIAS_TARGET");
    assert.deepEqual(res.path, ["OLD-MATH-G10", "MISSING-MATH-TARGET"]);
  }
});

test("Curriculum Alias Resolution (Case 5): valid multi-step chain resolves correctly", () => {
  const aliases = new Map<string, string>([
    ["LEGACY-MATH-V1", "LEGACY-MATH-V2"],
    ["LEGACY-MATH-V2", "MATH-G10"],
  ]);
  const validTargets = new Set(["MATH-G10", "PHYS-G10"]);

  const res = resolveCurriculumAlias("LEGACY-MATH-V1", aliases, validTargets);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.resolved, "MATH-G10");
    assert.deepEqual(res.path, ["LEGACY-MATH-V1", "LEGACY-MATH-V2", "MATH-G10"]);
  }
});

test("Curriculum Alias Resolution (Case 6): valid terminal resolution resolves directly", () => {
  const aliases = new Map<string, string>([["ALIAS-SINGLE", "MATH-G10"]]);
  const validTargets = new Set(["MATH-G10"]);

  const res = resolveCurriculumAlias("ALIAS-SINGLE", aliases, validTargets);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.resolved, "MATH-G10");
    assert.deepEqual(res.path, ["ALIAS-SINGLE", "MATH-G10"]);
  }

  const resDirect = resolveCurriculumAlias("MATH-G10", aliases, validTargets);
  assert.equal(resDirect.ok, true);
  if (resDirect.ok) {
    assert.equal(resDirect.resolved, "MATH-G10");
    assert.deepEqual(resDirect.path, ["MATH-G10"]);
  }
});

test("Curriculum Alias Resolution (Case 7): duplicate alias declaration returns DUPLICATE_ALIAS_DECLARATION error", () => {
  const duplicateEntries: Array<[string, string]> = [
    ["ALIAS-DUP", "TARGET-1"],
    ["ALIAS-DUP", "TARGET-2"],
  ];

  const validation = validateCurriculumAliases(duplicateEntries);
  assert.equal(validation.ok, false);
  assert.equal(validation.error, "DUPLICATE_ALIAS_DECLARATION");
  assert.equal(validation.duplicateKey, "ALIAS-DUP");

  const built = buildAliasMap(duplicateEntries);
  assert.equal(built.duplicateError, true);
});

test("Curriculum Alias Resolution (Case 8): chain matching maximum allowed depth succeeds", () => {
  const maxDepth = 3;
  const aliases = new Map<string, string>([
    ["DEPTH-0", "DEPTH-1"],
    ["DEPTH-1", "DEPTH-2"],
    ["DEPTH-2", "TARGET-FINAL"],
  ]);
  const validTargets = new Set(["TARGET-FINAL"]);

  const res = resolveCurriculumAlias("DEPTH-0", aliases, validTargets, maxDepth);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.resolved, "TARGET-FINAL");
    assert.deepEqual(res.path, ["DEPTH-0", "DEPTH-1", "DEPTH-2", "TARGET-FINAL"]);
  }
});

test("Curriculum Alias Resolution (Case 9): exceeding maximum allowed depth fails closed", () => {
  const maxDepth = 3;
  const aliases = new Map<string, string>([
    ["STEP-0", "STEP-1"],
    ["STEP-1", "STEP-2"],
    ["STEP-2", "STEP-3"],
    ["STEP-3", "TARGET-FINAL"],
  ]);
  const validTargets = new Set(["TARGET-FINAL"]);

  const res = resolveCurriculumAlias("STEP-0", aliases, validTargets, maxDepth);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error, "MAX_DEPTH_EXCEEDED");
  }
});

test("Curriculum Alias Resolution (Case 10): repeated aliases differing only by normalization/case when contract applies", () => {
  const caseDiffEntries: Array<[string, string]> = [
    ["alias-code", "TARGET-A"],
    ["ALIAS-CODE", "TARGET-B"],
  ];

  const validation = validateCurriculumAliases(caseDiffEntries, { normalizeCase: true });
  assert.equal(validation.ok, false);
  assert.equal(validation.error, "DUPLICATE_ALIAS_DECLARATION");

  const normalizedAliases = new Map<string, string>([["alias-code", "TARGET-FINAL"]]);
  const validTargets = new Set(["TARGET-FINAL"]);

  const res = resolveCurriculumAlias("ALIAS-CODE", normalizedAliases, validTargets, 10, {
    normalizeCase: true,
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.resolved, "TARGET-FINAL");
  }

  const snapshot = createCurriculumSnapshot({
    subjects: ["MATH-G10"],
    aliases: [["MATH-OLD", "MATH-G10"]],
  });
  assert.ok(snapshot.aliases);
  assert.equal(snapshot.aliases.get("MATH-OLD"), "MATH-G10");
});
