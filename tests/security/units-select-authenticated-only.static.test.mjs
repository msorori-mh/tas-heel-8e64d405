// Static checks for PRE-IMPORT-STABILITY-AND-IMPORT-TEMPLATES-ALIGNMENT-01:
// the units SELECT policy must be authenticated-only and access-scoped.
// Run from the repo root with:
//   node --test tests/security/units-select-authenticated-only.static.test.mjs
// Text-level assertions only: no database, no network.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const MIGRATIONS_DIR = new URL("../../supabase/migrations/", import.meta.url);
const RESTRICT_NAME = "20260731180000_restrict_units_select_to_authenticated.sql";

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const read = (name) => readFileSync(new URL(name, MIGRATIONS_DIR), "utf8");
const restrict = read(RESTRICT_NAME);

test("public units SELECT policy is dropped", () => {
  assert.match(restrict, /DROP POLICY IF EXISTS "Units viewable by everyone" ON public\.units;/);
});

test("replacement policy is authenticated-only and access-scoped", () => {
  assert.match(
    restrict,
    /CREATE POLICY "Units viewable per subject access" ON public\.units\s+FOR SELECT TO authenticated\s+USING \(public\.can_access_subject\(subject_id\)\);/,
  );
  // The replacement must name a role — no bare PUBLIC policy.
  assert.doesNotMatch(restrict, /CREATE POLICY[^;]*ON public\.units[^;]*USING \(true\)/);
});

test("no later migration re-opens units SELECT to PUBLIC", () => {
  const later = migrationFiles.filter((f) => f > RESTRICT_NAME);
  for (const f of later) {
    const sql = read(f);
    assert.doesNotMatch(
      sql,
      /CREATE POLICY[^;]*ON public\.units[^;]*FOR SELECT(?!\s+TO)/,
      `${f} creates a units SELECT policy without a TO clause (PUBLIC)`,
    );
    assert.doesNotMatch(
      sql,
      /CREATE POLICY[^;]*ON public\.units[^;]*FOR SELECT TO (anon|public)\b/i,
      `${f} grants units SELECT to anon/public`,
    );
  }
});

test("content staff management of units is preserved", () => {
  const all = migrationFiles.map(read).join("\n");
  assert.match(all, /CREATE POLICY "Content staff manage units" ON public\.units FOR ALL TO authenticated/);
  assert.doesNotMatch(restrict, /DROP POLICY IF EXISTS "Content staff manage units"/);
});

test("migration contains no DML, destructive, financial, or auth/storage changes", () => {
  const code = restrict
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(code, /\b(INSERT INTO|UPDATE public\.|DELETE FROM|DROP TABLE|TRUNCATE|ALTER TABLE)\b/i);
  assert.doesNotMatch(code, /wallet|payment|subscription|storage\.|auth\./i);
});

test("migration does not touch questions, lessons, or exam policies", () => {
  assert.doesNotMatch(restrict, /ON public\.(questions|lessons|exam_templates|exam_template_questions|assessment_questions)\b/);
  assert.doesNotMatch(restrict, /correct_index|explanation/i);
});
