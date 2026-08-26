import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const plan = JSON.parse(
  fs.readFileSync("content-packages/chemistry-g12-iron-v3/production-binding-plan.json", "utf8"),
);

const seven = [
  "officialBookContent",
  "tamkeenExplanation",
  "quickReview",
  "mindMap",
  "simulation",
  "checkUnderstanding",
  "lessonAssessment",
];

test("binding is source-only and cannot apply or publish", () => {
  assert.equal(plan.mode, "SOURCE_ONLY_NO_PRODUCTION_WRITES");
  assert.equal(plan.source.package_production_apply, false);
  assert.equal(plan.acceptance.production_content_import_authorized, false);
  assert.equal(plan.write_contract.no_ready_transition, true);
  assert.equal(plan.write_contract.initial_lifecycle_status, "DRAFT");
});

test("measured grade and curriculum tracks are pinned exactly", () => {
  assert.equal(plan.identity.grade.id, "03780461-126a-4c63-bd1b-493098582dd9");
  assert.deepEqual(plan.identity.tracks, [
    { id: "cbbe62a4-1e49-4805-9640-c23347b15619", code: "sanaa" },
    { id: "7751f472-ef61-4b50-b940-0521eac2baef", code: "aden" },
  ]);
});

test("subject and lesson identities use natural keys without invented UUIDs", () => {
  assert.equal(plan.identity.subject.id, null);
  assert.equal(plan.identity.subject.code, "CHEM-G12");
  assert.equal(plan.identity.lesson.id, null);
  assert.equal(plan.identity.lesson.code, "CHEM-G12-IRON-FE");
  assert.equal(plan.identity.lesson.unit_id, null);
  assert.equal(plan.identity.lesson.semester, null);
  assert.equal(plan.identity.lesson.sort_order, null);
});

test("exact seven lifecycle capabilities start in DRAFT", () => {
  assert.deepEqual(plan.write_contract.expected_capabilities, seven);
  assert.equal(plan.write_contract.no_delete, true);
  assert.equal(plan.write_contract.idempotency, "READ_BEFORE_WRITE_AND_UNIQUE_NATURAL_KEYS");
});

test("textbook object reuse is hash-pinned and never a silent replacement", () => {
  const [sanaa, aden, activity] = plan.textbooks.records;
  assert.equal(plan.textbooks.bucket_visibility, "PRIVATE");
  assert.equal(plan.textbooks.access, "SIGNED_URL_ONLY");
  assert.equal(sanaa.sha256, aden.sha256);
  assert.equal(aden.reuse_same_object_as, "MAIN_TEXTBOOK:sanaa");
  assert.notEqual(activity.sha256, sanaa.sha256);
  assert.equal(plan.write_contract.no_silent_overwrite_on_hash_change, true);
});

test("answers remain server-only and revision-pinned", () => {
  assert.equal(plan.write_contract.answer_storage.initial_payload_contains_answers, false);
  assert.equal(plan.write_contract.answer_storage.revision_pinned, true);
  assert.equal(plan.acceptance.expected_answer_leak, 0);
});
