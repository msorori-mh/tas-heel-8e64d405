import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SQL = readFileSync(
  "supabase/migrations-pending/20260824000000_content_factory_11_publication.sql",
  "utf8",
);
const ASSERTS = readFileSync("scripts/content-factory/pg17/content-factory-11-assert.sql", "utf8");
const REPORT = readFileSync(
  "docs/content/TAMKEEN-CHEMISTRY-G12-IRON-CF11-PUBLICATION-READY-CLOSURE.md",
  "utf8",
);

test("publication ledger key is NOT NULL and structurally non-empty", () => {
  assert.match(SQL, /idempotency_key text NOT NULL,/);
  assert.match(
    SQL,
    /CONSTRAINT golden_lesson_publications_key_chk CHECK \(length\(btrim\(idempotency_key\)\) >= 8\)/,
  );
});

test("migration preflight refuses legacy publication rows without a durable key", () => {
  assert.match(SQL, /CF11_PREFLIGHT_LEGACY_PUBLICATION_WITHOUT_IDEMPOTENCY_KEY/);
  assert.match(SQL, /to_regclass\('public\.golden_lesson_publications'\) IS NOT NULL/);
});

test("EXECUTE still enforces a non-empty publication key", () => {
  assert.match(SQL, /IF _idempotency_key IS NULL OR length\(btrim\(_idempotency_key\)\) < 8 THEN/);
});

test("PG17 proves authenticated/anon cannot EXECUTE machine asset attestation", () => {
  assert.match(
    ASSERTS,
    /NOT has_function_privilege\('authenticated',\s*\n\s*'public\.golden_lesson_attest_cf11_asset\(uuid,uuid,text,text,bigint,text,text,text,text\)'/,
  );
  assert.match(
    ASSERTS,
    /NOT has_function_privilege\('anon',\s*\n\s*'public\.golden_lesson_attest_cf11_asset\(uuid,uuid,text,text,bigint,text,text,text,text\)'/,
  );
});

test("PG17 proves service_role can neither publish nor attest READY", () => {
  assert.match(ASSERTS, /CF11_R4: service_role must never publish or attest READY/);
  assert.match(
    ASSERTS,
    /golden_lesson_publications_key_chk[\s\S]{0,200}publications\.idempotency_key must carry a non-empty CHECK/,
  );
});

test("report withdraws ad-hoc lifecycle reset and names the audited path", () => {
  assert.doesNotMatch(REPORT, /reset (the )?seven lifecycle rows/i);
  assert.doesNotMatch(REPORT, /to `HOLD`\n\(the audited transition path\)/);
  assert.match(REPORT, /golden_lesson_revoke_cf11_ready/);
  assert.match(REPORT, /forward remediation migration/);
  assert.match(REPORT, /append-only[\s\S]{0,400}never\*\* deleted, reset or rewritten/);
});
