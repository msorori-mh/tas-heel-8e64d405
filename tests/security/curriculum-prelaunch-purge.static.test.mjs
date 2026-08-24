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
const ui = readFileSync(
  "src/components/admin/CurriculumPrelaunchPurgeControl.tsx",
  "utf8",
);
const legacyDialog = readFileSync(
  "src/components/admin/CurriculumDeleteDialog.tsx",
  "utf8",
);

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
  ]) assert.ok(migration.includes(token), `missing security contract: ${token}`);
  assert.doesNotMatch(migration, /DISABLE\s+TRIGGER/i);
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.admin_curriculum_force_delete/,
  );
});

test("admin UI requires typed confirmation and reason and does not expose old force delete", () => {
  assert.match(ui, /confirmation === status\.confirmation_phrase/);
  assert.match(ui, /reason\.trim\(\)\.length >= 12/);
  assert.match(ui, /_expected_preview_sha256: status\.preview_sha256/);
  assert.match(ui, /useAuth\(\)/);
  assert.doesNotMatch(legacyDialog, /admin_curriculum_force_delete|حذف نهائي قسري/);
});


test("prelaunch purge resolves pgcrypto from the production extensions schema", () => {
  assert.match(
    pgcryptoSchemaFix,
    /to_regprocedure\('extensions\.digest\(text,text\)'\)/,
  );
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
