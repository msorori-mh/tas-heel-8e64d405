import assert from "node:assert/strict";
import test from "node:test";
import { resolveCurriculumAlias } from "../../../src/lib/question-bank/import/curriculum-lookup.ts";

test("Curriculum Alias Resolution: detects self-alias", () => {
  const aliases = new Map<string, string>([
    ["MATH-G10", "MATH-G10"],
  ]);
  const validTargets = new Set(["MATH-G10"]);

  const res = resolveCurriculumAlias("MATH-G10", aliases, validTargets);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error, "SELF_ALIAS");
    assert.deepEqual(res.path, ["MATH-G10", "MATH-G10"]);
  }
});

test("Curriculum Alias Resolution: detects direct and indirect alias cycles", () => {
  // Direct cycle: A -> B -> A
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

  // Indirect cycle: A -> B -> C -> A
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

test("Curriculum Alias Resolution: detects missing alias targets", () => {
  const aliases = new Map<string, string>([
    ["OLD-MATH-G10", "MISSING-MATH-TARGET"],
  ]);
  const validTargets = new Set(["MATH-G10", "PHYS-G10"]);

  const res = resolveCurriculumAlias("OLD-MATH-G10", aliases, validTargets);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error, "MISSING_ALIAS_TARGET");
    assert.deepEqual(res.path, ["OLD-MATH-G10", "MISSING-MATH-TARGET"]);
  }
});

test("Curriculum Alias Resolution: successfully resolves valid multi-step alias chains", () => {
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
