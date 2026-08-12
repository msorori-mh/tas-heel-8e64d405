/**
 * IMPORT_STAGING_AND_EXECUTION_IMPLEMENTATION_03 — contract + static SQL guards.
 *
 * These tests never touch a database. They guard the migration source and the
 * pure staging/execution logic against the phase 02B acceptance conditions.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  IMPORT_RPC,
  JOB_EXECUTION_STATES,
  PHASE_03_APPLY_STATUS,
  PHASE_03_MIGRATION_PATH,
  QUESTION_BANK_BOUNDARY,
  RPC_ONLY_TABLES,
  assertGenericUpsertAllowed,
  assertJobTransition,
  canTransitionJob,
  isTerminalJobState,
} from "../../src/lib/import/import-execution-state.ts";
import {
  DuplicateNaturalKeyError,
  assertNoDuplicateNaturalKeys,
  buildNaturalKey,
  buildStagingPayload,
  computeRowHash,
  normalizeCell,
  normalizeContentCode,
} from "../../src/lib/import/import-row-hash.ts";
import { RESOURCE_METADATA_ALLOWLIST } from "../../src/lib/import/import-contract.ts";

const SQL = readFileSync(PHASE_03_MIGRATION_PATH, "utf8");

/* ------------------------------------------------------------------ */
/* Migration source guards                                             */
/* ------------------------------------------------------------------ */

test("phase 03 is not applied and lives outside supabase/migrations", () => {
  assert.equal(PHASE_03_APPLY_STATUS, "not_applied");
  assert.ok(PHASE_03_MIGRATION_PATH.startsWith("supabase/migrations-pending/"));
  assert.ok(SQL.includes("NOT APPLIED"));
});

test("no security trigger is left commented out", () => {
  const commentedTrigger = /^\s*--\s*CREATE\s+TRIGGER/im;
  assert.equal(commentedTrigger.test(SQL), false, "a commented trigger is an unenforced trigger");
});

test("every required trigger is created", () => {
  for (const trigger of [
    "trg_normalize_lesson_assessment_code",
    "trg_normalize_lesson_explanation_code",
    "trg_validate_lesson_resource_metadata",
    "trg_assert_content_review_entity_exists",
    "trg_reset_review_state_on_hash_change",
    "trg_cleanup_review_state_subjects",
    "trg_cleanup_review_state_units",
    "trg_cleanup_review_state_lessons",
    "trg_cleanup_review_state_explanations",
    "trg_cleanup_review_state_assessments",
    "trg_cleanup_review_state_questions",
  ]) {
    assert.ok(SQL.includes(`CREATE TRIGGER ${trigger}`), `missing trigger: ${trigger}`);
  }
});

test("no GRANT to anon anywhere", () => {
  const grants = SQL.split("\n").filter((l) => /^\s*GRANT\b/i.test(l));
  assert.ok(grants.length > 0);
  for (const line of grants) {
    assert.ok(!/\banon\b/.test(line), `anon must never be granted: ${line.trim()}`);
  }
});

test("PUBLIC and anon EXECUTE are revoked for every new function", () => {
  const created = [...SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]!);
  const revoked = [...SQL.matchAll(/REVOKE EXECUTE ON FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]!);
  const callable = created.filter((n) => !SQL.includes(`RETURNS trigger`) || !isTriggerFn(n));
  for (const fn of callable) {
    if (isTriggerFn(fn)) continue;
    assert.ok(revoked.includes(fn), `missing REVOKE EXECUTE for ${fn}`);
  }
  for (const line of SQL.split("\n").filter((l) => /^\s*REVOKE EXECUTE/i.test(l))) {
    assert.ok(/FROM PUBLIC, anon/.test(line), `revoke must cover PUBLIC and anon: ${line.trim()}`);
  }
});

function isTriggerFn(name: string): boolean {
  const re = new RegExp(`FUNCTION public\\.${name}\\(\\)\\s*\\n?RETURNS trigger`, "i");
  return re.test(SQL);
}

test("every SECURITY DEFINER function fixes its search_path", () => {
  const blocks = SQL.split("CREATE OR REPLACE FUNCTION").slice(1);
  for (const block of blocks) {
    if (!/SECURITY DEFINER/.test(block)) continue;
    const header = block.slice(0, block.indexOf("AS $$"));
    assert.ok(
      /SET search_path = public, pg_temp/.test(header),
      `SECURITY DEFINER without fixed search_path: ${block.slice(0, 60)}`,
    );
  }
});

test("authenticated gets SELECT only on the RPC-only tables", () => {
  for (const table of RPC_ONLY_TABLES) {
    assert.ok(SQL.includes(`GRANT SELECT ON public.${table} TO authenticated;`));
    assert.ok(
      !new RegExp(`GRANT[^\\n]*(INSERT|UPDATE|DELETE)[^\\n]*public\\.${table} TO authenticated`).test(SQL),
      `${table}: authenticated must never get write grants`,
    );
    assert.ok(SQL.includes(`GRANT ALL ON public.${table} TO service_role;`));
  }
});

test("no write policy exists on the RPC-only tables", () => {
  const policies = [...SQL.matchAll(/CREATE POLICY "([^"]+)"\s*\n\s*ON public\.([a-z_]+) FOR (\w+)/g)];
  for (const [, name, table, command] of policies) {
    if ((RPC_ONLY_TABLES as readonly string[]).includes(table!)) {
      assert.equal(command, "SELECT", `${table}: policy "${name}" must be read-only`);
    }
  }
});

test("staging ownership isolation is enforced in RLS", () => {
  assert.ok(SQL.includes("j.created_by = auth.uid()"));
  assert.ok(SQL.includes("public.is_full_admin(auth.uid())"));
});

test("polymorphic reference is fail-closed with an ELSE that raises", () => {
  const fn = SQL.slice(SQL.indexOf("assert_content_review_entity_exists()"));
  assert.ok(/ELSE\s*\n\s*--[^\n]*\n\s*RAISE EXCEPTION/.test(fn), "unknown entity_type must raise");
  assert.ok(fn.includes("references a missing"));
  for (const type of [
    "subjects",
    "units",
    "lessons",
    "lesson_explanations",
    "lesson_assessments",
    "questions",
  ]) {
    assert.ok(fn.includes(`WHEN '${type}' THEN`), `missing existence branch for ${type}`);
  }
});

test("required identity columns and indexes exist", () => {
  assert.ok(SQL.includes("ADD COLUMN IF NOT EXISTS assessment_code text"));
  assert.ok(SQL.includes("ADD COLUMN IF NOT EXISTS explanation_code text"));
  assert.ok(SQL.includes("CREATE UNIQUE INDEX lesson_assessments_code_uniq"));
  assert.ok(SQL.includes("CREATE UNIQUE INDEX lesson_explanations_code_lesson_uniq"));
  assert.ok(SQL.includes("CONSTRAINT import_staging_rows_key_uniq UNIQUE (job_id, template_key, natural_key)"));
  assert.ok(SQL.includes("row_hash text NOT NULL"));
  assert.ok(!/lesson_explanations_code_lesson_uniq[\s\S]{0,120}sort_order/.test(SQL), "sort_order is not identity");
});

test("resource metadata allowlist in SQL matches the contract allowlist", () => {
  const fn = SQL.slice(SQL.indexOf("validate_lesson_resource_metadata()"));
  for (const key of RESOURCE_METADATA_ALLOWLIST) {
    assert.ok(fn.includes(`'${key}'`), `metadata allowlist missing ${key}`);
  }
  assert.ok(fn.includes("unsupported lesson_resources.metadata key"));
});

test("concurrency is guarded by a row lock and state checks", () => {
  assert.ok(SQL.includes("FROM public.import_jobs WHERE id = _job_id FOR UPDATE"));
  assert.ok(SQL.includes("INVALID_STATE_TRANSITION"));
  assert.ok(SQL.includes("NOT_JOB_OWNER"));
  assert.ok(SQL.includes("NOT_AUTHORIZED"));
});

test("BLOCKED_PUBLISHED is decided before any domain write", () => {
  const exec = SQL.slice(SQL.indexOf("FUNCTION public.import_execute_template"));
  const blockedIdx = exec.indexOf("IF action = 'BLOCKED_PUBLISHED' THEN");
  const firstInsert = exec.indexOf("INSERT INTO public.subjects");
  assert.ok(blockedIdx > 0 && firstInsert > 0 && blockedIdx < firstInsert);
  assert.ok(exec.includes("CONTINUE;"));
});

test("counters are only updated after the row loop", () => {
  const exec = SQL.slice(SQL.indexOf("FUNCTION public.import_execute_template"));
  const loopEnd = exec.indexOf("END LOOP;");
  const counters = exec.indexOf("inserted_count = inserted_count + inserted");
  assert.ok(counters > loopEnd, "counters must be written after the loop, inside the same transaction");
});

test("template 09 never reaches a generic questions upsert", () => {
  assert.ok(SQL.includes("QUESTION_BANK_WORKFLOW_REQUIRED"));
  assert.ok(!/INSERT INTO public\.questions\b/.test(SQL), "no generic write into questions");
  assert.ok(!/UPDATE public\.questions\b/.test(SQL), "no generic update of questions");
  assert.equal(QUESTION_BANK_BOUNDARY.sharedTransactionWithContentTemplates, false);
  assert.throws(() => assertGenericUpsertAllowed("questions"), /QUESTION_BANK_WORKFLOW_REQUIRED/);
});

test("dry-run stays a zero-write path", () => {
  const dryRun = readFileSync(
    "src/lib/content-import/content-import-dry-run.functions.ts",
    "utf8",
  );
  assert.ok(!/\.rpc\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(/.test(dryRun));
});

test("prepare writes staging only — no domain table writes", () => {
  const staging = readFileSync("src/lib/import/import-staging.server.ts", "utf8");
  assert.ok(!/\.from\(["'](subjects|units|lessons|questions)["']\)/.test(staging));
  assert.ok(staging.includes("IMPORT_RPC.stage"));
  assert.equal(IMPORT_RPC.stage, "import_stage_rows");
});

/* ------------------------------------------------------------------ */
/* State machine                                                       */
/* ------------------------------------------------------------------ */

test("state machine matches validated → planned → applying → applied|failed", () => {
  assert.deepEqual([...JOB_EXECUTION_STATES], [
    "validated",
    "planned",
    "applying",
    "applied",
    "failed",
  ]);
  assert.ok(canTransitionJob("validated", "planned"));
  assert.ok(canTransitionJob("planned", "applying"));
  assert.ok(canTransitionJob("applying", "applied"));
  assert.ok(canTransitionJob("applying", "failed"));
  assert.equal(canTransitionJob("validated", "applying"), false);
  assert.equal(canTransitionJob("applied", "planned"), false);
  assert.ok(isTerminalJobState("applied"));
  assert.ok(isTerminalJobState("failed"));
  assert.throws(() => assertJobTransition("applied", "applying"), /INVALID_STATE_TRANSITION/);
});

/* ------------------------------------------------------------------ */
/* Hashing + idempotency inputs                                        */
/* ------------------------------------------------------------------ */

test("normalization folds whitespace and Arabic-Indic digits", () => {
  assert.equal(normalizeCell("  الوحدة   ١٢  "), "الوحدة 12");
  assert.equal(normalizeCell(undefined), "");
  assert.equal(normalizeContentCode("  PHY-01 "), "phy-01");
});

test("row hash ignores operator-only columns and sort order changes only when hashed", () => {
  const base = { subject_code: "PHY", name: "فيزياء", grade_slug: "g10", sort_order: "1" };
  const withNotes = { ...base, editor_notes: "مراجعة", review_status: "approved" };
  assert.equal(computeRowHash("subjects", base), computeRowHash("subjects", withNotes));
  assert.notEqual(computeRowHash("subjects", base), computeRowHash("subjects", { ...base, name: "كيمياء" }));
});

test("row hash is stable and deterministic across equivalent formatting", () => {
  const a = { subject_code: "PHY", name: " فيزياء ", grade_slug: "g10" };
  const b = { subject_code: "PHY", name: "فيزياء", grade_slug: "g10" };
  assert.equal(computeRowHash("subjects", a), computeRowHash("subjects", b));
  assert.match(computeRowHash("subjects", a), /^[0-9a-f]{64}$/);
});

test("natural keys follow the contract fields", () => {
  assert.equal(buildNaturalKey("subjects", { subject_code: " PHY " }), "phy");
  assert.equal(
    buildNaturalKey("units", { subject_code: "PHY", unit_code: "U1" }),
    "phy\u001fu1",
  );
});

test("staging payload carries only contract fields", () => {
  const payload = buildStagingPayload("subjects", {
    subject_code: "PHY",
    name: "فيزياء",
    editor_notes: "لا يجب أن تُحفظ",
    review_status: "approved",
  });
  assert.equal(payload["editor_notes"], undefined);
  assert.equal(payload["review_status"], undefined);
  assert.equal(payload["subject_code"], "PHY");
});

test("duplicate natural key inside one job is blocked before any DB call", () => {
  assert.throws(
    () =>
      assertNoDuplicateNaturalKeys(
        [
          { naturalKey: "phy", rowNumber: 2 },
          { naturalKey: "phy", rowNumber: 7 },
        ],
        "subjects",
      ),
    (e: unknown) => e instanceof DuplicateNaturalKeyError,
  );
});
