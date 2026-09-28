import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("drizzle/migrations/0001_audited_lab_experiment_corrections.sql", "utf8");
const gate = readFileSync("drizzle/migrations/0002_enforce_lab_correction_visibility.sql", "utf8");
const functions = readFileSync("src/lib/content-factory/lesson-component-publishing-v2.functions.ts", "utf8");
const builder = readFileSync("src/components/admin/GoldenLessonPackageBuilder.tsx", "utf8");
const artifact = readFileSync("src/routes/api/offline-pack.artifact.$resourceId.ts", "utf8");

test("lab correction is full-admin-only, hash-pinned, audited and atomic", () => {
  assert.match(migration, /IF v_uid IS NULL OR NOT public\.is_full_admin\(v_uid\)/);
  assert.match(migration, /v_intake\.status <> 'VERIFIED'/);
  assert.match(migration, /v_intake\.created_by <> v_uid/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /cf11_verified_bundle_sha256' IS DISTINCT FROM _expected_old_sha256/);
  assert.match(migration, /lesson_component_publish_v2\(_intake_id/);
  assert.match(migration, /INSERT INTO public\.lesson_lab_corrections/);
  assert.match(migration, /INSERT INTO public\.audit_logs/);
  assert.match(migration, /old_resource_id uuid NOT NULL UNIQUE/);
  assert.doesNotMatch(migration, /UPDATE public\.lesson_resources SET/);
});

test("replaced lab reads are blocked, including direct artifact links", () => {
  assert.match(gate, /AS RESTRICTIVE FOR SELECT/);
  assert.match(gate, /SECURITY DEFINER/);
  assert.match(migration, /get_lesson_full_content[\s\S]*NOT EXISTS\(SELECT 1 FROM public\.lesson_lab_corrections/);
  assert.match(artifact, /is_replaced_lab_resource/);
  assert.match(functions, /replacedIds\.has\(experiment\.resourceId\)/);
  assert.match(builder, /تصحيح: \{row\.instanceTitle/);
  assert.match(builder, /correctLessonComponentV2Lab/);
});