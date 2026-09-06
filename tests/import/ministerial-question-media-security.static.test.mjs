import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * MINISTERIAL_QUESTION_MEDIA_V1 — static security contract.
 *
 * The migration is delivered under supabase/migrations-pending until it is
 * explicitly approved for the production database; once promoted it keeps the
 * same file name under supabase/migrations. Both locations are accepted here.
 */
const MIGRATION_NAME = "20260914010000_ministerial_question_media.sql";
const migrationPath = [
  `supabase/migrations/${MIGRATION_NAME}`,
  `supabase/migrations-pending/${MIGRATION_NAME}`,
].find((path) => existsSync(path));
assert.ok(migrationPath, `${MIGRATION_NAME} must exist (pending or applied)`);

const sql = readFileSync(migrationPath, "utf8");
const contract = readFileSync("src/lib/ministerial/ministerial-media-contract.ts", "utf8");
const parser = readFileSync("src/lib/ministerial/ministerial-package-xlsx.ts", "utf8");
const adminApi = readFileSync("src/lib/ministerial/ministerial-admin-api.ts", "utf8");
const studentApi = readFileSync("src/lib/ministerial/ministerial-student-api.ts", "utf8");
const endpoint = readFileSync("src/routes/api/ministerial-media.$mediaId.ts", "utf8");
const mediaClient = readFileSync("src/lib/ministerial/ministerial-media-client.ts", "utf8");
const importer = readFileSync("src/components/admin/MinisterialTrackPackageImporter.tsx", "utf8");
const manager = readFileSync("src/components/admin/MinisterialQuestionsManager.tsx", "utf8");
const image = readFileSync("src/components/ministerial/MinisterialMediaImage.tsx", "utf8");
const workflow = readFileSync(".github/workflows/web-ci.yml", "utf8");
const runner = readFileSync("tests/import/run-pg17-ministerial-media-rehearsal.sh", "utf8");
const smoke = readFileSync("tests/import/fixtures/pg17-ministerial-media-smoke.sql", "utf8");
const prereq = readFileSync("tests/import/fixtures/pg17-prereq-ministerial-media.sql", "utf8");

function fn(name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `function ${name} must be defined by the migration`);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
  return sql.slice(start, next === -1 ? undefined : next);
}

test("the shared media contract is strict: three raster types, hard limits, content-addressed keys", () => {
  assert.match(contract, /QUESTION_MEDIA_BUCKET = "question-media"/);
  assert.match(contract, /\["image\/png", "image\/jpeg", "image\/webp"\]/);
  assert.doesNotMatch(contract, /image\/svg|image\/gif|image\/bmp|image\/tiff/);
  assert.match(contract, /maxImageBytes:\s*8 \* 1024 \* 1024/);
  assert.match(contract, /maxTotalBytes:\s*50 \* 1024 \* 1024/);
  assert.match(
    contract,
    /MINISTERIAL_MEDIA_STORAGE_KEY_RE =\s*\/\^ministerial\\\/\[0-9a-f\]\{2\}\\\/\[0-9a-f\]\{64\}/,
  );
  assert.match(contract, /export function detectImageMime/);
  assert.match(contract, /export function isSafeZipEntryName/);
  assert.match(contract, /ADEN_MEDIA_PLACEMENTS = \[\s*"QUESTION",\s*"SOLUTION",?\s*\]/);
});

test("the ZIP parser is hardened (traversal, bombs, magic bytes, unique names, no stray files)", () => {
  assert.match(parser, /isSafeZipEntryName\(/);
  assert.match(parser, /maxZipEntries|MAX_ZIP_ENTRIES/);
  assert.match(parser, /compressedSize|_data\.compressedSize|uncompressedSize/);
  assert.match(parser, /detectImageMime\(/);
  assert.match(parser, /sha256|SHA-256/i);
  assert.match(parser, /ملف غير متوقع داخل الحزمة/);
  assert.match(parser, /اسم ملف غير آمن/);
  assert.match(parser, /ministerial_track_package_v2/);
  assert.match(parser, /ministerial_track_package_v1/);
  // Media columns are optional; a workbook without them stays a v1 package.
  assert.match(parser, /hasMedia|media\.length === 0|mediaFiles\.length/);
});

test("uploads go to the private bucket under content-addressed keys and never upsert", () => {
  assert.match(adminApi, /QUESTION_MEDIA_BUCKET/);
  assert.match(adminApi, /ministerialMediaStorageKey\(/);
  assert.match(adminApi, /upsert:\s*false/);
  assert.doesNotMatch(
    adminApi,
    /\.from\(["']question_media["']\)\.(?:insert|update|delete|upsert)/,
  );
  assert.doesNotMatch(adminApi, /getPublicUrl/);
  assert.match(adminApi, /ministerial_track_package_prepare/);
  assert.match(adminApi, /ministerial_track_package_execute/);
  assert.match(adminApi, /ministerial_model_question_update/);
});

test("migration: media validation fails closed and the storage object is verified before insert", () => {
  const validate = fn("_ministerial_validate_media_array");
  for (const code of [
    "MINISTERIAL_MEDIA_PLACEMENT_INVALID",
    "MINISTERIAL_MEDIA_PLACEMENT_DUPLICATE",
    "MINISTERIAL_MEDIA_SHA256_INVALID",
    "MINISTERIAL_MEDIA_MIME_INVALID",
    "MINISTERIAL_MEDIA_SIZE_INVALID",
    "MINISTERIAL_MEDIA_ALT_TEXT_INVALID",
    "MINISTERIAL_MEDIA_STORAGE_PATH_MISMATCH",
  ]) {
    assert.match(validate, new RegExp(code), `${code} must be raised by the validator`);
  }
  assert.match(validate, /8388608/);
  assert.match(validate, /'image\/png', 'image\/jpeg', 'image\/webp'/);
  assert.doesNotMatch(validate, /svg/i);

  const insert = fn("_ministerial_insert_revision_media");
  assert.match(insert, /_ministerial_media_object_verified\(/);
  assert.match(insert, /MINISTERIAL_MEDIA_OBJECT_MISSING/);
  assert.match(insert, /MINISTERIAL_MEDIA_REVISION_NOT_DRAFT/);

  const verified = fn("_ministerial_media_object_verified");
  assert.match(verified, /bucket_id = 'question-media'/);
  assert.match(verified, /USING _storage_key, _file_size, _mime_type/);
  assert.doesNotMatch(verified, /format\(/);
});

test("migration: prepare/execute stay atomic, v1-compatible and cap the total media size", () => {
  const prepare = fn("ministerial_track_package_prepare");
  assert.match(prepare, /'ministerial_track_package_v1', 'ministerial_track_package_v2'/);
  assert.match(prepare, /MINISTERIAL_PACKAGE_MEDIA_REQUIRES_V2/);
  assert.match(prepare, /52428800/);
  assert.match(prepare, /MINISTERIAL_PACKAGE_MEDIA_TOTAL_TOO_LARGE/);
  assert.match(prepare, /is_content_staff\(v_actor\)/);
  const execute = fn("ministerial_track_package_execute");
  assert.match(execute, /_ministerial_validate_media_array\(v_question->'media'/);
  assert.match(
    execute,
    /_ministerial_insert_revision_media\(v_revision_id, v_media, v_actor, true\)/,
  );
  assert.match(execute, /_qb_compute_revision_payload_hash/);
  assert.match(execute, /'published_models', 0/);
  assert.doesNotMatch(execute, /EXCEPTION WHEN OTHERS/);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.ministerial_track_package_prepare\(jsonb\) FROM PUBLIC, anon/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.ministerial_track_package_execute\(uuid, text\) FROM PUBLIC, anon/,
  );
});

test("migration: storage policies are staff-only, bucket-scoped, key-shaped, and never anon", () => {
  const policies = sql.slice(
    sql.indexOf('CREATE POLICY "question_media_staff_read"'),
    sql.indexOf("-- 5)"),
  );
  assert.match(
    policies,
    /"question_media_staff_read" ON storage\.objects[\s\S]*?FOR SELECT TO authenticated/,
  );
  assert.match(
    policies,
    /"question_media_staff_insert" ON storage\.objects[\s\S]*?FOR INSERT TO authenticated/,
  );
  assert.match(
    policies,
    /"question_media_staff_update" ON storage\.objects[\s\S]*?FOR UPDATE TO authenticated/,
  );
  assert.match(
    policies,
    /"question_media_admin_delete" ON storage\.objects[\s\S]*?FOR DELETE TO authenticated/,
  );
  assert.doesNotMatch(policies, /TO anon|TO public/i);
  assert.equal((policies.match(/bucket_id = 'question-media'/g) ?? []).length >= 4, true);
  assert.match(policies, /is_content_staff\(auth\.uid\(\)\)/);
  assert.match(policies, /is_full_admin\(auth\.uid\(\)\)/);
  assert.match(policies, /name ~ '\^ministerial\/\[0-9a-f\]\{2\}\/\[0-9a-f\]\{64\}/);
  assert.doesNotMatch(sql, /INSERT INTO storage\.buckets|UPDATE storage\.buckets/);
});

test("migration: sessions pin media without paths; state hides SOLUTION; reveal/result gate it", () => {
  const rendered = fn("_ministerial_revision_rendered_media");
  assert.doesNotMatch(rendered, /'storage_path'/);
  assert.match(rendered, /'media_id'/);
  assert.match(rendered, /'placement'/);
  const session = fn("create_ministerial_exam_session");
  assert.match(session, /rendered_media/);
  assert.match(session, /_ministerial_revision_rendered_media\(/);
  const state = fn("get_ministerial_session_state");
  assert.match(state, /<> 'SOLUTION'/);
  assert.doesNotMatch(state, /storage_path|question_solutions|model_answer/);
  const reveal = fn("reveal_ministerial_training_answer");
  assert.match(reveal, /solution_media/);
  assert.match(reveal, /ANSWER_REQUIRED_BEFORE_REVEAL/);
  assert.match(reveal, /REVEAL_NOT_ALLOWED_IN_STRICT/);
  assert.doesNotMatch(reveal, /storage_path/);
  const result = fn("get_ministerial_session_result");
  assert.match(result, /solution_media/);
  assert.match(result, /SESSION_NOT_COMPLETED/);
  assert.doesNotMatch(result, /storage_path/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS rendered_media jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
});

test("migration: the media access gate requires ownership, hides solutions until reveal, no anon", () => {
  const gate = fn("ministerial_media_can_access");
  assert.match(gate, /auth\.uid\(\)/);
  assert.match(gate, /is_content_staff\(/);
  assert.match(gate, /user_id = v_user/);
  assert.match(gate, /revealed_at IS NOT NULL/);
  assert.match(gate, /'SOLUTION'/);
  assert.match(gate, /RETURN false/);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.ministerial_media_can_access\(uuid, uuid\) FROM PUBLIC, anon/,
  );
});

test("migration: admin edits create a new revision, are blocked by sessions, and stay publishable", () => {
  const update = fn("ministerial_model_question_update");
  assert.match(update, /MINISTERIAL_EDIT_BLOCKED_SESSIONS_EXIST/);
  assert.match(update, /can_publish_ministerial_exams\(v_actor\)/);
  assert.match(update, /INSERT INTO public\.question_revisions/);
  assert.match(update, /SET status='SUPERSEDED'/);
  assert.match(update, /_ministerial_insert_revision_media\(v_new_revision/);
  // carry-over copies the old revision's media instead of mutating it
  assert.match(
    update,
    /FROM public\.question_media qm WHERE qm\.question_revision_id=v_old_revision/,
  );
  assert.doesNotMatch(update, /UPDATE public\.question_media|DELETE FROM public\.question_media/);
  // targets are revision-scoped and must follow the new revision
  assert.match(
    update,
    /INSERT INTO public\.question_targets[\s\S]*?WHERE t\.revision_id=v_old_revision/,
  );
  // demote before touching membership so the published-membership guard allows it
  const demote = update.indexOf("SET status='draft',published_at=NULL");
  const membership = update.indexOf(
    "UPDATE public.ministerial_exam_questions SET published_revision_id",
  );
  assert.ok(demote > -1 && membership > -1 && demote < membership);
  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.ministerial_model_question_update\(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text\)/,
  );
  const list = fn("ministerial_model_questions_admin_list");
  assert.match(list, /'has_sessions'/);
  assert.doesNotMatch(list, /'storage_path'/);
});

test("migration: internal helpers are service_role-only and the proof block guards leaks", () => {
  for (const helper of [
    "_ministerial_validate_media_array(jsonb, text)",
    "_ministerial_insert_revision_media(uuid, jsonb, uuid, boolean)",
    "_ministerial_revision_rendered_media(uuid)",
  ]) {
    const escaped = helper.replace(/[()]/g, "\\$&");
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped}\\s+FROM PUBLIC, anon, authenticated`),
    );
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped} TO service_role`));
  }
  assert.match(sql, /MINISTERIAL_MEDIA_STORAGE_PATH_LEAK/);
  assert.match(sql, /MINISTERIAL_MEDIA_PRIVILEGE_LEAK/);
  assert.match(sql, /MINISTERIAL_MEDIA_GUARD_MISSING/);
  // Scope: payments / wallet / roles are untouched.
  assert.doesNotMatch(
    sql,
    /wallet_|payment_|subscriptions|user_roles|app_role|admin_adjust_wallet/,
  );
});

test("the media endpoint authenticates, gates through the RPC, and serves short-lived private bytes", () => {
  assert.match(endpoint, /Bearer /);
  assert.match(endpoint, /getClaims|getUser/);
  assert.match(endpoint, /rpc\("ministerial_media_can_access"/);
  assert.match(endpoint, /createSignedUrl\(auth\.media\.storage_path, SIGNED_TTL_SECONDS\)/);
  assert.match(endpoint, /SIGNED_TTL_SECONDS = 60/);
  assert.match(endpoint, /"x-content-type-options", "nosniff"/);
  assert.match(endpoint, /cache-control", `private/);
  assert.match(endpoint, /deny\(404/);
  assert.match(endpoint, /HEAD: async/);
  // Admin client is loaded inside the handler, only after the caller was verified.
  assert.doesNotMatch(endpoint, /^import .*client\.server/m);
  assert.match(endpoint, /await import\("@\/integrations\/supabase\/client\.server"\)/);
  // The signed URL itself is never returned to the browser; bytes are proxied.
  assert.doesNotMatch(endpoint, /signedUrl\s*\}\)|json\(\{\s*url/);
  assert.match(mediaClient, /\/api\/ministerial-media\//);
  assert.doesNotMatch(mediaClient, /getPublicUrl|createSignedUrl/);
});

test("student and admin surfaces render media through the gated endpoint only", () => {
  assert.match(studentApi, /solution_media/);
  assert.match(studentApi, /placement === "QUESTION"/);
  assert.doesNotMatch(studentApi, /storage_path/);
  assert.match(image, /MinisterialMediaImage/);
  assert.match(image, /alt=\{/);
  assert.match(image, /dir="rtl"|dir=\{"rtl"\}|rtl/);
  assert.match(importer, /\.zip/);
  assert.match(importer, /\.xlsx/);
  assert.match(importer, /uploadMinisterialMedia|uploadMinisterialPackageMedia/);
  assert.match(manager, /has_sessions|hasSessions/);
  assert.match(manager, /ministerial_model_question_update|updateMinisterialModelQuestion/);
});

test("the media path is rehearsed on disposable PostgreSQL 17 (localhost only, never production)", () => {
  assert.match(workflow, /run-pg17-ministerial-media-rehearsal\.sh/);
  assert.match(workflow, /tamkeen_ministerial_media/);
  assert.match(runner, /MINISTERIAL_PG17_URL must target localhost/);
  assert.match(runner, /pg17-prereq-ministerial-media\.sql/);
  assert.match(runner, /20260913010000_ministerial_multi_variant_question_management\.sql/);
  assert.match(runner, /20260914010000_ministerial_question_media\.sql/);
  assert.match(runner, /pg17-ministerial-media-smoke\.sql/);
  assert.match(runner, /-lt 80/);
  assert.match(prereq, /VALUES \('question-media', 'question-media', false\)/);
  for (const assertion of [
    "execute without uploaded objects is refused",
    "failed execute leaves no media row behind",
    "size mismatch rolls back every media row",
    "published media rows are frozen",
    "pinned media never carry storage paths",
    "state exposes only non-solution media",
    "solution media is hidden before reveal",
    "another student cannot borrow the session",
    "anonymous never gets media",
    "editing is blocked while sessions exist",
    "old revision is superseded, not mutated",
    "edited model passes the publish gate",
    "no bucket policy targets anon",
  ]) {
    assert.match(smoke, new RegExp(assertion), `smoke must assert: ${assertion}`);
  }
});
