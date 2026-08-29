/**
 * LESSON_COMPONENT_INDEPENDENT_PUBLISHING_02 — the all-or-nothing rule was enforced in
 * four places at once. Removing it from one and leaving it in another produces a screen
 * that accepts a partial upload and a student who still sees nothing, so each layer is
 * pinned here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260831010000_lesson_component_independent_publishing_02.sql",
  "utf8",
);
const validator = readFileSync("src/lib/content-factory/golden-lesson-validator.ts", "utf8");
const builder = readFileSync("src/components/admin/GoldenLessonPackageBuilder.tsx", "utf8");
const studentRoute = readFileSync("src/routes/_authenticated/lessons.$lessonId.tsx", "utf8");
const exactnessMigration = readFileSync(
  "supabase/migrations/20260909010000_component_publish_exactness_idempotency.sql",
  "utf8",
);
const directPublish = readFileSync(
  "src/lib/content-factory/golden-lesson-direct-publish.functions.ts",
  "utf8",
);

test("the database no longer rejects a package whose capability has no file", () => {
  assert.doesNotMatch(migration, /RAISE EXCEPTION 'REQUIRED_ARTIFACT_MISSING/);
  assert.match(migration, /PACKAGE_HAS_NO_CONTENT/);
  // The seven records are still described, and the other artifact rules stay intact.
  assert.match(migration, /jsonb_array_length\(_manifest->'artifacts'\) <> 7/);
  assert.match(migration, /OFFICIAL_PROVENANCE_MISSING/);
  assert.match(migration, /APPLICABILITY_MISMATCH/);
});

test("a managed lesson becomes visible on one READY capability, not on all of them", () => {
  const body = migration.slice(migration.indexOf("FUNCTION public.lesson_student_visible"));
  assert.match(body, /l\.status = 'READY'/);
  // The old lesson-level gate required every REQUIRED row to be READY and treated any
  // row carrying a draft_hash as a blocker for the whole lesson.
  assert.doesNotMatch(body, /applicability = 'REQUIRED'/);
  assert.doesNotMatch(body, /status IS DISTINCT FROM 'READY'/);
  assert.doesNotMatch(body, /draft_hash/);
});

test("DRAFT and REVIEW stay hidden — the migration never promotes anything", () => {
  assert.doesNotMatch(migration, /SET status = 'READY'/);
  assert.doesNotMatch(migration, /UPDATE public\.lesson_capability_lifecycle/);
  assert.doesNotMatch(migration, /INSERT INTO public\.lesson_capability_lifecycle/);
});

test("the package validator drops the mandatory-file rule but keeps a content floor", () => {
  assert.doesNotMatch(validator, /"REQUIRED_ARTIFACT_MISSING"/);
  assert.match(validator, /PACKAGE_HAS_NO_CONTENT/);
  assert.match(validator, /"OFFICIAL_PROVENANCE_MISSING"/);
});

test("the import screen no longer presents any component as mandatory", () => {
  assert.doesNotMatch(builder, /اكتمال الملفات الإلزامية/);
  assert.doesNotMatch(builder, /"إلزامي"/);
  assert.doesNotMatch(builder, /إلزامية للنشر/);
  assert.match(builder, /لا يوجد مكوّن إلزامي/);
  assert.match(builder, /uploadedCount/);
});

test("the student surface still renders strictly from the READY set", () => {
  assert.match(studentRoute, /filterStudentCapabilitiesByLifecycle/);
  assert.match(studentRoute, /readyKeys/);
});

/**
 * The PG17 jobs apply migrations by explicit filename, not by scanning the folder,
 * so a migration can be merged without a single database ever running it. Both the
 * migration and its proof script must be named in the workflow.
 */
/**
 * Both migrations need the CF10/CF11 chain: lesson_student_visible references
 * lesson_is_editorially_managed, and the authored-subset helper needs
 * cf11_lifecycle_capabilities and v3_capability_snapshot. Only the CF04–CF11 rehearsal
 * builds that, so the whole proof rides there — the Content V3 container cannot even
 * apply the migrations, let alone prove them.
 */
test("both migrations are exercised by a PG17 gate that can actually run them", () => {
  const workflow = readFileSync(".github/workflows/web-ci.yml", "utf8");
  const rehearsal = readFileSync(
    "scripts/content-factory/pg17/rehearse-content-factory-11.sh",
    "utf8",
  );

  for (const path of [
    "supabase/migrations/20260831010000_lesson_component_independent_publishing_02.sql",
    "supabase/migrations/20260831020000_cf11_ready_scoped_to_authored_components.sql",
    "scripts/content-factory/pg17/lesson-component-independent-publishing-02-cf11-pg17.sql",
  ]) {
    assert.ok(rehearsal.includes(path), `CF11 rehearsal does not run ${path}`);
  }

  // The migrations must NOT be applied in the Content V3 job, which has no CF10/CF11.
  assert.doesNotMatch(workflow, /20260831010000_lesson_component_independent_publishing_02\.sql/);
  assert.doesNotMatch(workflow, /20260831020000_cf11_ready_scoped_to_authored_components\.sql/);

  assert.match(
    workflow,
    /tests\/content-factory\/lesson-component-independent-publishing-02\.static\.test\.mjs/,
  );
});

/**
 * A LANGUAGE sql body is resolved at CREATE time, which would tie this migration to the
 * order CF10/CF11 happened to be applied in. plpgsql resolves at call time.
 */
test("the authored-subset helper does not depend on migration order", () => {
  const cf11 = readFileSync(
    "supabase/migrations/20260831020000_cf11_ready_scoped_to_authored_components.sql",
    "utf8",
  );
  assert.match(
    cf11,
    /FUNCTION public\.cf11_authored_capabilities\(_lesson_id uuid\)\s*\nRETURNS text\[\] LANGUAGE plpgsql/,
  );
});

/**
 * The CF11 READY path is the gate that actually kept a single published component
 * invisible. Relaxing it must widen only WHICH capabilities are attested — never any
 * of the guards that decide WHETHER the lesson may be attested at all.
 */
test("the CF11 READY relaxation is scoped to authored components", () => {
  const cf11 = readFileSync(
    "supabase/migrations/20260831020000_cf11_ready_scoped_to_authored_components.sql",
    "utf8",
  );
  assert.match(cf11, /cf11_authored_capabilities\(lesson_row\.id\)/);
  assert.match(cf11, /CF11_NO_AUTHORED_CAPABILITY/);
  assert.match(cf11, /IF live_caps IS DISTINCT FROM authored_caps THEN/);
  assert.match(cf11, /FOREACH lifecycle_cap IN ARRAY attested_caps LOOP/);
});

/**
 * LCIP-02 made the FIRST partial publish work and stopped there. Publishing a SECOND
 * component still failed: publish moved every capability to REVIEW including the one
 * already READY, and cf11_assert_demotion_allowed refuses READY -> REVIEW. Staff were
 * therefore still forced to upload all seven at once.
 */
test("publishing a second component does not demote the first", () => {
  const lcip03 = readFileSync(
    "supabase/migrations/20260901010000_publish_second_component_without_demoting_first.sql",
    "utf8",
  );
  const rehearsal = readFileSync(
    "scripts/content-factory/pg17/rehearse-content-factory-11.sh",
    "utf8",
  );

  // Anchored patch, not a wholesale replacement: the deployed publish function is 38KB
  // and has drifted from this repository, so replacing it would discard that drift.
  assert.match(lcip03, /LCIP03_ANCHOR_NOT_UNIQUE/);
  assert.match(lcip03, /IS DISTINCT FROM ''READY'' THEN/);
  assert.match(lcip03, /status IN \(''REVIEW'', ''READY''\)/);

  // The guard that makes the relaxation safe must not be touched.
  assert.doesNotMatch(lcip03, /DROP FUNCTION[^\n]*cf11_assert_demotion_allowed/);

  assert.ok(
    rehearsal.includes(
      "supabase/migrations/20260901010000_publish_second_component_without_demoting_first.sql",
    ),
    "LCIP-03 is not exercised by the CF11 rehearsal",
  );
});

test("every CF11 guard survives the relaxation", () => {
  const cf11 = readFileSync(
    "supabase/migrations/20260831020000_cf11_ready_scoped_to_authored_components.sql",
    "utf8",
  );
  for (const guard of [
    "CF11_ACTOR_IDENTITY_MISMATCH",
    "CF11_NOT_AUTHORIZED",
    "CF11_SEPARATION_OF_DUTIES",
    "CF11_PUBLICATION_REVOKED",
    "CF11_READY_EVIDENCE_REQUIRED",
    "CF11_LESSON_NOT_FREE",
    "CF11_READY_REQUIRES_REVIEW_FOR_ALL",
    "CF11_HTML_NOT_PUBLISHED",
    "CF11_ASSET_OBJECT_VANISHED",
    "CF11_ASSET_ATTESTATION_DRIFT_AT_READY",
    "CF11_ASSET_OBJECT_IDENTITY_DRIFT_AT_READY",
    "CF11_ASSET_ATTESTATION_SET_DRIFT_AT_READY",
    "CF11_ANSWER_LEAK_DETECTED",
    "CF11_SNAPSHOT_NOT_RECONCILABLE",
    "CF11_READY_SET_NOT_EXACT",
    "cf11_assert_replay_state",
    "cf11_assert_exact_required_lifecycle_set",
  ]) {
    assert.ok(cf11.includes(guard), `CF11 guard lost: ${guard}`);
  }
});

/**
 * The production database is running a lesson_student_visible body that exists in no
 * migration file. Replaying 20260820023919 would silently revert it, so this migration
 * must carry that exact body forward.
 */
test("the migration records the visibility rule production already runs", () => {
  assert.match(migration, /النشر المستقل: الدرس يظهر بمجرد نشر مكوّن واحد على الأقل/);
  assert.match(migration, /l\.status = 'READY'\)/);
});

test("the PG17 proof covers publish, isolation and demotion, not just the happy path", () => {
  const proof = readFileSync(
    "scripts/content-factory/pg17/lesson-component-independent-publishing-02-cf11-pg17.sql",
    "utf8",
  );
  assert.match(proof, /LCIP02_DRAFT_ONLY_LESSON_IS_VISIBLE/);
  assert.match(proof, /LCIP02_SINGLE_READY_COMPONENT_STILL_HIDDEN/);
  assert.match(proof, /LCIP02_GATE_LEAKED_UNREADY_COMPONENTS/);
  assert.match(proof, /LCIP02_SIBLING_DEMOTION_HID_THE_LESSON/);
  assert.match(proof, /LCIP02_EMPTY_PACKAGE_WAS_ACCEPTED/);
});

test("manifest history is auditable but no longer globally unique", () => {
  assert.match(
    exactnessMigration,
    /DROP CONSTRAINT IF EXISTS golden_lesson_package_version_package_id_canonical_manifest_key/,
  );
  assert.match(exactnessMigration, /golden_lesson_package_versions_manifest_history_idx/);
  assert.doesNotMatch(
    exactnessMigration,
    /ADD CONSTRAINT[^;]+UNIQUE\s*\(package_id,\s*canonical_manifest_sha256\)/s,
  );
});

test("historical prepared batches are not callable publication sources", () => {
  assert.match(
    exactnessMigration,
    /DROP FUNCTION IF EXISTS public\.golden_lesson_publish_component_by_file/,
  );
  assert.doesNotMatch(directPublish, /golden_lesson_publish_component_by_file/);
  assert.match(directPublish, /COMPONENT_SOURCE_HASH_MISMATCH/);
  assert.match(directPublish, /ensureVerifiedAssets\(batchId\)/);
});

test("component publish has an immutable idempotency receipt and a live replay guard", () => {
  for (const contract of [
    "golden_lesson_component_publications",
    "golden_lesson_component_publications_batch_capability_key",
    "golden_lesson_component_publications_idempotency_key",
    "golden_lesson_component_publications_immutable_row",
    "pg_advisory_xact_lock",
    "LCP_REPLAY_IDEMPOTENCY_KEY_CONFLICT",
    "LCP_REPLAY_LIVE_STATE_CONFLICT",
    "idempotent_replay",
  ]) {
    assert.ok(
      exactnessMigration.includes(contract),
      `component publish contract lost: ${contract}`,
    );
  }
});

test("the exactness migration and A-B-A/idempotency proof run in PostgreSQL 17", () => {
  const rehearsal = readFileSync(
    "scripts/content-factory/pg17/rehearse-content-factory-11.sh",
    "utf8",
  );
  const proof = readFileSync(
    "scripts/content-factory/pg17/component-publishing-exactness-03-pg17.sql",
    "utf8",
  );
  assert.match(rehearsal, /20260909010000_component_publish_exactness_idempotency\.sql/);
  assert.match(rehearsal, /component-publishing-exactness-03-pg17\.sql/);
  assert.match(proof, /'applicability', 'OPTIONAL'/);
  assert.doesNotMatch(proof, /SELECT manifest INTO base_manifest/);
  assert.match(proof, /LCP_EXACTNESS_ABA_NOT_VERSIONED/);
  assert.match(proof, /LCP_EXACTNESS_REPLAY_WROTE_TWICE/);
  assert.match(proof, /LCP_EXACTNESS_DIFFERENT_REPLAY_KEY_WAS_ACCEPTED/);
});
