import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = (name) =>
  readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

test("search-path hardening is limited to five functions", async () => {
  const sql = await migration("20260919010000_s2_function_search_path_hardening.sql");
  assert.equal((sql.match(/alter function/gi) ?? []).length, 5);
  assert.equal((sql.match(/set search_path = ''/g) ?? []).length, 5);
  assert.doesNotMatch(sql, /create\s+(or\s+replace\s+)?function|grant\s|revoke\s/i);
});

test("duplicate cleanup removes only the redundant older index", async () => {
  const sql = await migration("20260919020000_s2_drop_duplicate_wallet_refund_index.sql");
  assert.match(sql, /drop index if exists public\.uniq_wallet_tx_subscription_refund/);
  assert.doesNotMatch(sql, /drop index[^;]*uniq_wallet_tx_one_refund_per_subscription/);
});

test("high-growth exam batch adds thirteen non-unique indexes", async () => {
  const sql = await migration("20260919030000_s2_index_high_growth_exam_foreign_keys.sql");
  assert.equal((sql.match(/create index if not exists/gi) ?? []).length, 13);
  assert.match(sql, /exam_session_answers \(session_id, exam_session_question_id\)/);
  assert.doesNotMatch(sql, /drop\s|unique\s+index|concurrently/i);
});

test("core RLS batches alter seven predicates plus two advisor follow-ups", async () => {
  const core = await migration("20260919040000_s2_optimize_core_student_rls_initplans.sql");
  const followUp = await migration("20260919050000_s2_optimize_admin_uid_rls_initplans.sql");
  assert.equal((core.match(/alter policy/gi) ?? []).length, 7);
  assert.equal((followUp.match(/alter policy/gi) ?? []).length, 2);
  assert.equal((followUp.match(/has_role\(\(select auth\.uid\(\)/g) ?? []).length, 2);
  assert.doesNotMatch(`${core}\n${followUp}`, /drop policy|create policy|grant\s|revoke\s/i);
});
