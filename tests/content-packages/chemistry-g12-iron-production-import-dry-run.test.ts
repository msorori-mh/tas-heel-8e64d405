import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildIronProductionImportDryRun,
  type IronBindingPlan,
} from "../../src/lib/import/iron-production-import-dry-run.ts";

const plan = JSON.parse(readFileSync(
  "content-packages/chemistry-g12-iron-v3/production-binding-plan.json",
  "utf8",
)) as IronBindingPlan;

const openGates = {
  R5_APPLIED: true,
  "21H_APPLIED": true,
  POSTVERIFY_PASS: true,
  VISIBILITY_DIFF_ZERO: true,
} as const;

const baseline = {
  gates: openGates,
  gradeId: plan.identity.grade.id,
  trackIdsByCode: Object.fromEntries(plan.identity.tracks.map((track) => [track.code, track.id])),
};

test("dry-run is zero-write and deterministic", () => {
  const first = buildIronProductionImportDryRun(plan, baseline);
  const second = buildIronProductionImportDryRun(plan, baseline);
  assert.deepEqual(first, second);
  assert.equal(first.verdict, "READY_FOR_OWNER_APPLY");
  assert.equal(first.writesPerformed, 0);
  assert.equal(first.expectedWriteIntentCount, 16);
  assert.deepEqual(first.intents.map((intent) => intent.order), [...Array(16)].map((_, i) => i + 1));
});

test("every closed schema gate blocks but still performs zero writes", () => {
  for (const gate of Object.keys(openGates)) {
    const result = buildIronProductionImportDryRun(plan, {
      ...baseline,
      gates: { ...openGates, [gate]: false },
    });
    assert.equal(result.verdict, "BLOCKED");
    assert.equal(result.writesPerformed, 0);
    assert.ok(result.blockers.includes(`SCHEMA_GATE_CLOSED:${gate}`));
  }
});

test("identity and textbook hash conflicts fail closed", () => {
  const naturalKey = plan.textbooks.records[0]!.natural_key.join("\u001f");
  const result = buildIronProductionImportDryRun(plan, {
    ...baseline,
    gradeId: "wrong-grade",
    trackIdsByCode: { sanaa: "wrong-track", aden: plan.identity.tracks[1]!.id },
    textbookHashesByNaturalKey: { [naturalKey]: "different-hash" },
  });
  assert.equal(result.verdict, "BLOCKED");
  assert.equal(result.writesPerformed, 0);
  assert.ok(result.blockers.includes("GRADE_IDENTITY_MISMATCH"));
  assert.ok(result.blockers.includes("TRACK_IDENTITY_MISMATCH:sanaa"));
  assert.ok(result.blockers.some((blocker) => blocker.startsWith("TEXTBOOK_HASH_CONFLICT:")));
});

test("planner deduplicates identical Sanaa and Aden textbook bytes", () => {
  const result = buildIronProductionImportDryRun(plan, baseline);
  const uploads = result.intents.filter((intent) => intent.entity === "private_textbook_object");
  const bindings = result.intents.filter((intent) => intent.entity === "subject_textbooks");
  assert.equal(uploads.length, 2);
  assert.equal(bindings.length, 3);
  assert.equal(new Set(uploads.map((intent) => intent.naturalKey)).size, 2);
});

test("all seven capabilities are draft intents and no READY intent exists", () => {
  const result = buildIronProductionImportDryRun(plan, baseline);
  const capabilities = result.intents.filter((intent) => intent.entity === "lesson_capability");
  assert.equal(capabilities.length, 7);
  assert.ok(capabilities.every((intent) => intent.kind === "UPSERT_DRAFT"));
  assert.ok(result.intents.every((intent) => !intent.kind.includes("READY")));
});
