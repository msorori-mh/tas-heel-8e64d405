/**
 * Shared helpers for HTML Content Operational E2E.
 *
 * Used by:
 *   - tests/content-import/html-content-operational-e2e.test.mjs (backend E2E)
 *   - tests/content-import/browser-html-content-e2e.spec.ts (browser E2E)
 *
 * All operations target Local Supabase only.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import JSZip from "jszip";

import { supabaseAdmin } from "../../src/integrations/supabase/client.server.ts";

export const FIXTURE_DIR = join(process.cwd(), "tests", "content-import", "html-e2e");
export const TEST_PREFIX = "TEST_ONLY_TAMKEEN_HTML_E2E";

export const DETERMINISTIC = {
  adminId: "11111111-1111-1111-1111-111111111111",
  contentManagerId: "22222222-2222-2222-2222-222222222222",
  studentId: "33333333-3333-3333-3333-333333333333",
  gradeId: "44444444-4444-4444-4444-444444444444",
  subjectId: "55555555-5555-5555-5555-555555555555",
  unitId: "66666666-6666-6666-6666-666666666666",
  lessonId: "77777777-7777-7777-7777-777777777777",
};

export const RESOURCES = [
  {
    code: "TEST_MM_E2E_001",
    type: "mind_map_html",
    title: `${TEST_PREFIX} Mind Map`,
    sortOrder: 1,
  },
  {
    code: "TEST_EXP_E2E_001",
    type: "practical_experiment_html",
    title: `${TEST_PREFIX} Experiment`,
    sortOrder: 2,
  },
  {
    code: "TEST_SUM_E2E_001",
    type: "summary_html",
    title: `${TEST_PREFIX} Summary`,
    sortOrder: 3,
  },
];

export const LESSON_CODE = "test-lesson-html-e2e-001";
export const DRAFTS_BUCKET = "lesson-resource-drafts";
export const PUBLISHED_BUCKET = "lesson-resource-published";

export function loadEnvLocal() {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // Assume env is already injected.
  }
}
loadEnvLocal();

export function fixturePath(...segments) {
  return join(FIXTURE_DIR, ...segments);
}

export function loadFixtureBytes(...segments) {
  return new Uint8Array(readFileSync(fixturePath(...segments)));
}

export async function runSql(sql) {
  const pool = new pg.Pool({
    connectionString: "postgresql://postgres:postgres@127.0.0.1:54422/postgres",
  });
  try {
    return await pool.query(sql);
  } finally {
    await pool.end();
  }
}

export async function ensureServiceRoleGrants() {
  await runSql(`
    GRANT ALL ON public.grades TO service_role;
    GRANT ALL ON public.subjects TO service_role;
    GRANT ALL ON public.units TO service_role;
    GRANT ALL ON public.lessons TO service_role;
    GRANT ALL ON public.profiles TO service_role;
    GRANT ALL ON public.subscriptions TO service_role;
    GRANT ALL ON public.user_roles TO service_role;
    GRANT ALL ON public.content_feature_flags TO service_role;
    GRANT ALL ON public.lesson_resources TO service_role;
    GRANT ALL ON public.lesson_resource_versions TO service_role;
    GRANT ALL ON public.lesson_resource_files TO service_role;
    GRANT ALL ON public.lesson_resource_upload_sessions TO service_role;
    GRANT ALL ON public.content_import_batches TO service_role;
    GRANT ALL ON public.content_package_validations TO service_role;
    GRANT ALL ON public.lesson_resource_events TO service_role;
    GRANT ALL ON public.lesson_resource_reviews TO service_role;
    GRANT ALL ON public.storage_operations TO service_role;
    GRANT ALL ON public.idempotency_ledger TO service_role;
    GRANT ALL ON public.governorates TO service_role;
    GRANT ALL ON public.curriculum_tracks TO service_role;
    GRANT ALL ON public.governorate_curriculum_map TO service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
  `);
}

export async function ensureAuthenticatedGrants() {
  await runSql(`
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT ON public.grades TO authenticated;
    GRANT SELECT ON public.subjects TO authenticated;
    GRANT SELECT ON public.units TO authenticated;
    GRANT SELECT ON public.lessons TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
    GRANT SELECT ON public.subscriptions TO authenticated;
    GRANT SELECT ON public.user_roles TO authenticated;
    GRANT SELECT ON public.content_feature_flags TO authenticated;
    GRANT SELECT ON public.lesson_resources TO authenticated;
    GRANT SELECT ON public.lesson_resource_versions TO authenticated;
    GRANT SELECT ON public.lesson_resource_files TO authenticated;
    GRANT SELECT ON public.lesson_resource_upload_sessions TO authenticated;
    GRANT SELECT ON public.content_import_batches TO authenticated;
    GRANT SELECT ON public.content_package_validations TO authenticated;
    GRANT SELECT ON public.lesson_resource_events TO authenticated;
    GRANT SELECT ON public.lesson_resource_reviews TO authenticated;
    GRANT SELECT ON public.storage_operations TO authenticated;
    GRANT SELECT ON public.idempotency_ledger TO authenticated;
    GRANT SELECT ON public.governorates TO authenticated;
    GRANT SELECT ON public.curriculum_tracks TO authenticated;
    GRANT SELECT ON public.governorate_curriculum_map TO authenticated;
    GRANT SELECT ON public.lesson_summaries TO authenticated;
    GRANT SELECT ON public.lesson_simulations TO authenticated;
    GRANT SELECT ON public.lesson_book_contents TO authenticated;
    GRANT SELECT ON public.lesson_explanations TO authenticated;
    GRANT SELECT ON public.questions TO authenticated;
    GRANT SELECT ON public.exam_templates TO authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
  `);
}

export async function ensureLocalActorWrappers() {
  const wrapperSql = `
CREATE OR REPLACE FUNCTION public.submit_resource_for_review_with_actor(p_resource_id uuid, p_expected_lock_version integer DEFAULT NULL, p_actor_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor_id::text, auth.uid()::text), true);
  BEGIN
    PERFORM public.submit_resource_for_review(p_resource_id, p_expected_lock_version);
  EXCEPTION
    WHEN serialization_failure THEN
      RAISE EXCEPTION 'Resource % lock version mismatch (CAS rejected)', p_resource_id USING ERRCODE = '42000';
    WHEN OTHERS THEN
      RAISE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_resource_with_actor(p_resource_id uuid, p_version_id uuid, p_expected_lock_version integer DEFAULT NULL, p_actor_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor_id::text, auth.uid()::text), true);
  PERFORM public.approve_resource(p_resource_id, p_version_id, p_expected_lock_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_resource_with_actor(p_resource_id uuid, p_version_id uuid, p_reason text, p_expected_lock_version integer DEFAULT NULL, p_actor_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor_id::text, auth.uid()::text), true);
  PERFORM public.reject_resource(p_resource_id, p_version_id, p_reason, p_expected_lock_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_resource_with_actor(p_resource_id uuid, p_expected_lock_version integer DEFAULT NULL, p_actor_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor_id::text, auth.uid()::text), true);
  PERFORM public.unpublish_resource(p_resource_id, p_expected_lock_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_resource_with_actor(p_resource_id uuid, p_target_version_id uuid, p_expected_lock_version integer, p_actor_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor_id::text, auth.uid()::text), true);
  PERFORM public.rollback_resource(p_resource_id, p_target_version_id, p_expected_lock_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_successful_resource_publication_with_actor(p_resource_id uuid, p_version_id uuid, p_storage_operation_id uuid, p_expected_lock_version integer, p_upload_session_id uuid DEFAULT NULL, p_actor_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor_id::text, auth.uid()::text), true);
  PERFORM public.record_successful_resource_publication(p_resource_id, p_version_id, p_storage_operation_id, p_expected_lock_version, p_upload_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_resource_for_review_with_actor(uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_resource_with_actor(uuid, uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_resource_with_actor(uuid, uuid, text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unpublish_resource_with_actor(uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_resource_with_actor(uuid, uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_successful_resource_publication_with_actor(uuid, uuid, uuid, integer, uuid, uuid) TO service_role;
  `;
  await runSql(wrapperSql);
}

export async function buildMinimalValidZip(resourceCode, resourceType) {
  const zip = new JSZip();
  const folder = zip.folder("package");
  folder.file(
    "index.html",
    `<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>${resourceCode}</title></head><body><h1>${resourceCode}</h1></body></html>`,
  );
  folder.file(
    "manifest.json",
    JSON.stringify(
      {
        resource_code: resourceCode,
        resource_type: resourceType,
        version: 1,
        entry_file: "index.html",
        offline_enabled: true,
        required_files: ["index.html"],
        content_sha256: "",
      },
      null,
      2,
    ),
  );
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

export async function uploadBytesToSignedUrl(signedUrl, bytes) {
  const response = await fetch(signedUrl, {
    method: "PUT",
    body: bytes,
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Signed upload failed: ${response.status} ${response.statusText} ${body}`);
  }
}

export async function createAuthUser(id, email, password) {
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  for (const u of existing?.users ?? []) {
    if (u.email === email) {
      await supabaseAdmin.auth.admin.deleteUser(u.id);
    }
  }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    id,
    email,
    password,
    email_confirm: true,
  });
  if (error && !error.message?.includes("already been registered")) {
    assert.ifError(error);
  }
}

export async function buildAuthenticatedClient(email, password) {
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!anonKey || !url) throw new Error("Missing anon client env vars");

  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message || "no session"}`);
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

export async function resetTestData() {
  const { data: publishedObjects } = await supabaseAdmin.storage
    .from(PUBLISHED_BUCKET)
    .list("published", { limit: 1000 });
  if (publishedObjects && publishedObjects.length > 0) {
    const paths = publishedObjects.map((o) => `published/${o.name}`);
    await supabaseAdmin.storage.from(PUBLISHED_BUCKET).remove(paths);
  }

  const { data: draftObjects } = await supabaseAdmin.storage
    .from(DRAFTS_BUCKET)
    .list("html-packages", { limit: 1000 });
  if (draftObjects && draftObjects.length > 0) {
    const paths = draftObjects.map((o) => `html-packages/staging/${o.name}`);
    await supabaseAdmin.storage.from(DRAFTS_BUCKET).remove(paths);
  }

  await runSql("TRUNCATE public.lesson_resources CASCADE;");

  await supabaseAdmin.from("subscriptions").delete().in("user_id", [
    DETERMINISTIC.adminId,
    DETERMINISTIC.contentManagerId,
    DETERMINISTIC.studentId,
  ]);
  await supabaseAdmin.from("profiles").delete().in("user_id", [
    DETERMINISTIC.adminId,
    DETERMINISTIC.contentManagerId,
    DETERMINISTIC.studentId,
  ]);
  await supabaseAdmin.from("user_roles").delete().in("user_id", [
    DETERMINISTIC.adminId,
    DETERMINISTIC.contentManagerId,
    DETERMINISTIC.studentId,
  ]);
  await supabaseAdmin.from("lessons").delete().eq("id", DETERMINISTIC.lessonId);
  await supabaseAdmin.from("units").delete().eq("id", DETERMINISTIC.unitId);
  await supabaseAdmin.from("subjects").delete().eq("id", DETERMINISTIC.subjectId);
  await supabaseAdmin.from("grades").delete().eq("id", DETERMINISTIC.gradeId);

  for (const email of [
    "admin-html-e2e@test.local",
    "cm-html-e2e@test.local",
    "student-html-e2e@test.local",
  ]) {
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    for (const u of existing?.users ?? []) {
      if (u.email === email) {
        await supabaseAdmin.auth.admin.deleteUser(u.id);
      }
    }
  }
}

export async function seedTestData() {
  const { error: gradeErr } = await supabaseAdmin.from("grades").insert({
    id: DETERMINISTIC.gradeId,
    slug: "test-grade-html-e2e-001",
    name: `${TEST_PREFIX} Grade`,
    category: "test",
    sort_order: 9999,
  });
  if (gradeErr && !gradeErr.message.includes("duplicate")) assert.ifError(gradeErr);

  const { error: subjectErr } = await supabaseAdmin.from("subjects").insert({
    id: DETERMINISTIC.subjectId,
    grade_id: DETERMINISTIC.gradeId,
    slug: "test-subject-html-e2e-001",
    name: `${TEST_PREFIX} Subject`,
    curriculum_track_id: null,
    sort_order: 9999,
    semester: 1,
  });
  if (subjectErr && !subjectErr.message.includes("duplicate")) assert.ifError(subjectErr);

  const { error: unitErr } = await supabaseAdmin.from("units").insert({
    id: DETERMINISTIC.unitId,
    subject_id: DETERMINISTIC.subjectId,
    title: `${TEST_PREFIX} Unit`,
    description: "Operational E2E test unit",
    sort_order: 9999,
    semester: 1,
    is_free: true,
  });
  if (unitErr && !unitErr.message.includes("duplicate")) assert.ifError(unitErr);

  const { error: lessonErr } = await supabaseAdmin.from("lessons").insert({
    id: DETERMINISTIC.lessonId,
    subject_id: DETERMINISTIC.subjectId,
    unit_id: DETERMINISTIC.unitId,
    slug: LESSON_CODE,
    title: `${TEST_PREFIX} Lesson`,
    is_free: true,
    sort_order: 9999,
    semester: 1,
  });
  if (lessonErr && !lessonErr.message.includes("duplicate")) assert.ifError(lessonErr);

  await createAuthUser(DETERMINISTIC.adminId, "admin-html-e2e@test.local", "Password123!");
  await createAuthUser(DETERMINISTIC.contentManagerId, "cm-html-e2e@test.local", "Password123!");
  await createAuthUser(DETERMINISTIC.studentId, "student-html-e2e@test.local", "Password123!");

  // Profiles need a valid governorate + curriculum track so the auth hook
  // treats them as complete and redirects to /app after login.
  const govResult = await runSql(
    `SELECT id, default_curriculum_track_id FROM public.governorates WHERE default_curriculum_track_id IS NOT NULL ORDER BY sort_order LIMIT 1;`,
  );
  const govRow = govResult.rows[0];
  const governorateId = govRow?.id ?? null;
  const curriculumTrackId = govRow?.default_curriculum_track_id ?? null;

  const roles = [
    { user_id: DETERMINISTIC.adminId, role: "admin" },
    { user_id: DETERMINISTIC.contentManagerId, role: "content_manager" },
    { user_id: DETERMINISTIC.studentId, role: "user" },
  ];
  for (const r of roles) {
    const { error } = await supabaseAdmin.from("user_roles").insert(r);
    if (error && !error.message.includes("duplicate")) assert.ifError(error);
  }

  const baseProfile = {
    full_name: "E2E Test",
    phone: "+967700000000",
    grade_uuid: DETERMINISTIC.gradeId,
    curriculum_track_id: curriculumTrackId,
    governorate_id: governorateId,
  };
  const profiles = [
    { user_id: DETERMINISTIC.adminId, ...baseProfile },
    { user_id: DETERMINISTIC.contentManagerId, ...baseProfile },
    { user_id: DETERMINISTIC.studentId, ...baseProfile },
  ];
  const { error: profileErr } = await supabaseAdmin.from("profiles").upsert(profiles, {
    onConflict: "user_id",
  });
  assert.ifError(profileErr);

  const { error: subErr } = await supabaseAdmin.from("subscriptions").insert({
    user_id: DETERMINISTIC.studentId,
    grade_id: DETERMINISTIC.gradeId,
    semester: 1,
    status: "active",
    starts_at: new Date(Date.now() - 86400 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
  });
  if (subErr && !subErr.message.includes("duplicate")) assert.ifError(subErr);
}

export async function assertFeatureFlagsEnabled() {
  const { data: flags } = await supabaseAdmin
    .from("content_feature_flags")
    .select("flag_key,is_enabled");
  const flagMap = new Map(flags?.map((f) => [f.flag_key, f.is_enabled]) ?? []);
  for (const key of [
    "html_content_backend",
    "html_content_upload",
    "html_content_publish",
    "html_content_student_read",
  ]) {
    assert.equal(flagMap.get(key), true, `Feature flag ${key} must be enabled`);
  }
}
