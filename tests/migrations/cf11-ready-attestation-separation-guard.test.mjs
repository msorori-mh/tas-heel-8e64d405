import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = "supabase/migrations";

function findMigration() {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql"));
  const hits = files.filter((f) =>
    readFileSync(join(MIG_DIR, f), "utf8").includes(
      "cf11_guard_ready_attestation_separation()\nRETURNS trigger",
    ),
  );
  assert.equal(hits.length, 1, "exactly one CF11 separation-guard migration must exist");
  return readFileSync(join(MIG_DIR, hits[0]), "utf8");
}

const sql = findMigration();

test("drops only the static separation CHECK constraint", () => {
  assert.match(sql, /DROP CONSTRAINT IF EXISTS golden_lesson_ready_attestations_separation_chk/);
  assert.ok(!/snapshot_chk/.test(sql), "snapshot CHECK must stay untouched");
  assert.ok(!/_fkey/.test(sql), "foreign keys must stay untouched");
  assert.ok(!/DROP CONSTRAINT IF EXISTS golden_lesson_ready_attestations_batch_id_key/.test(sql));
  assert.ok(!/\bDELETE\s+FROM\b/i.test(sql), "migration must not delete data");
  assert.ok(!/\bUPDATE\s+public\./i.test(sql), "migration must not mutate rows");
});

test("non-admin self-attestation is rejected", () => {
  assert.match(
    sql,
    /IF is_admin IS NOT TRUE THEN\s+RAISE EXCEPTION 'CF11_ATTESTATION_SEPARATION_REQUIRED'/,
  );
});

test("admin self-attestation is allowed only via a verified role check", () => {
  assert.match(sql, /is_admin := public\.golden_lesson_has_role\(NEW\.attested_by, 'admin'\)/);
});

test("distinct identities short-circuit to allowed", () => {
  assert.match(sql, /IF NEW\.attested_by <> NEW\.published_by THEN\s+RETURN NEW;/);
});

test("guard is fail-closed on invalid identity or failed role lookup", () => {
  assert.match(sql, /NEW\.attested_by IS NULL OR NEW\.published_by IS NULL/);
  assert.match(sql, /CF11_ATTESTATION_IDENTITY_INVALID/);
  assert.match(
    sql,
    /EXCEPTION WHEN OTHERS THEN\s+RAISE EXCEPTION 'CF11_ATTESTATION_ROLE_CHECK_FAILED'/,
  );
});

test("guard runs on both insert and update, security definer, pinned search_path", () => {
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.golden_lesson_ready_attestations/);
  assert.match(
    sql,
    /FOR EACH ROW EXECUTE FUNCTION public\.cf11_guard_ready_attestation_separation\(\)/,
  );
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = public/);
});
