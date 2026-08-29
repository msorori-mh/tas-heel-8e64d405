import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260824223000_prelaunch_curriculum_global_purge.sql",
  "utf8",
);
const pgcryptoSchemaFix = readFileSync(
  "supabase/migrations/20260824231500_prelaunch_purge_pgcrypto_schema_fix.sql",
  "utf8",
);
const safeUpdateFinal = readFileSync(
  "supabase/migrations/20260824234000_prelaunch_purge_safeupdate_final.sql",
  "utf8",
);
const ui = readFileSync("src/components/admin/CurriculumPrelaunchPurgeControl.tsx", "utf8");
const legacyDialog = readFileSync("src/components/admin/CurriculumDeleteDialog.tsx", "utf8");

test("prelaunch purge is full-admin, preview-bound, idempotent, audited, and centrally lockable", () => {
  for (const token of [
    "is_full_admin(auth.uid())",
    "PRELAUNCH_PURGE_STALE_PREVIEW",
    "_expected_preview_sha256",
    "_idempotency_key",
    "curriculum_prelaunch_purge_runs",
    "curriculum_prelaunch_purge_tickets",
    "curriculum_prelaunch_global_purge",
    "admin_lock_curriculum_prelaunch_purge",
    "PRELAUNCH_PURGE_LOCK_REQUIRES_EMPTY_CURRICULUM",
  ])
    assert.ok(migration.includes(token), `missing security contract: ${token}`);
  assert.doesNotMatch(migration, /DISABLE\s+TRIGGER/i);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.admin_curriculum_force_delete/);
});

test("the bulk purge requires a typed confirmation, a reason and a pinned preview", () => {
  assert.match(ui, /confirmation === status\.confirmation_phrase/);
  assert.match(ui, /reason\.trim\(\)\.length >= 12/);
  assert.match(ui, /_expected_preview_sha256: status\.preview_sha256/);
  assert.match(ui, /useAuth\(\)/);
});

/**
 * Force delete is a deliberate prelaunch tool, not the blanket escape hatch it used to be.
 * It is kept because deleting test curriculum has to stay cheap while no real student data
 * exists — so what this asserts is the shape that makes it defensible, and it fails if any
 * one of those four constraints is dropped.
 *
 * Revisit before real student records exist: at that point the blockers this steps over are
 * protecting people's work, and the ticketed prelaunch purge is the right instrument.
 */
test("force delete stays narrow, preview-blocked, audited and admin-enforced", () => {
  // 1. the authoritative preview must report that ordinary deletion is blocked
  assert.match(legacyDialog, /preview\s*&&\s*!preview\.deletable/);
  assert.match(legacyDialog, /DELETE_BLOCKED/);
  // 2. only for units and lessons — never a subject, question or exam template
  assert.match(
    legacyDialog,
    /FORCE_DELETABLE: readonly CurriculumEntityType\[\] = \["unit", "lesson"\]/,
  );
  assert.match(legacyDialog, /FORCE_DELETABLE\.includes\(target\.type\)/);
  // 3. every failure carries a traceable rpc/request marker
  assert.match(legacyDialog, /trackedError\("admin_curriculum_force_delete"/);
  // 4. the refusal for a non-admin is surfaced, and enforced server-side regardless
  assert.match(legacyDialog, /الحذف القسري متاح لمدير كامل الصلاحيات فقط/);
  assert.match(legacyDialog, /سجل التدقيق/);
});

test("prelaunch purge resolves pgcrypto from the production extensions schema", () => {
  assert.match(pgcryptoSchemaFix, /to_regprocedure\('extensions\.digest\(text,text\)'\)/);
  assert.match(
    pgcryptoSchemaFix,
    /ALTER FUNCTION public\.admin_curriculum_prelaunch_purge_status\(\)[\s\S]*SET search_path = public, extensions, pg_temp/,
  );
  assert.match(
    pgcryptoSchemaFix,
    /ALTER FUNCTION public\.admin_curriculum_prelaunch_purge\(text, text, text, text\)[\s\S]*SET search_path = public, extensions, pg_temp/,
  );
  assert.doesNotMatch(pgcryptoSchemaFix, /DISABLE\s+TRIGGER/i);
});

test("all global purge deletes are explicit and safeupdate-compatible", () => {
  const boundedDeletes =
    safeUpdateFinal.match(/DELETE\s+FROM\s+public\.[a-z0-9_]+\s+WHERE\s+true\s*;/gi) ?? [];
  assert.equal(boundedDeletes.length, 47);
  assert.doesNotMatch(safeUpdateFinal, /DELETE\s+FROM\s+public\.[a-z0-9_]+\s*;/i);
  assert.match(safeUpdateFinal, /extensions\.digest/);
  assert.match(safeUpdateFinal, /PRELAUNCH_PURGE_UNBOUNDED_DELETE_REMAINS/);
  assert.doesNotMatch(safeUpdateFinal, /DISABLE\s+TRIGGER/i);
});
