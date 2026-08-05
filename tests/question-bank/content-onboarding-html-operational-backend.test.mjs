import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260806120000_content_onboarding_html_operational_backend.sql"
);

describe("Operational HTML Content Backend Migration & Contract Tests (PR 17)", () => {
  it("should exist and be strictly additive (no DROP TABLE lesson_resources)", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    assert.ok(sql.includes("ALTER TABLE public.lesson_resources"), "Migration must use ALTER TABLE on lesson_resources");
    assert.equal(sql.includes("DROP TABLE public.lesson_resources"), false, "Migration MUST NOT drop lesson_resources");
    assert.equal(sql.includes("DROP TABLE lesson_resources"), false, "Migration MUST NOT drop lesson_resources");
    assert.equal(sql.includes("CREATE TABLE IF NOT EXISTS public.lesson_resources ("), false, "Migration MUST NOT recreate lesson_resources");
  });

  it("should include all 8 operational backend tables", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    const requiredTables = [
      "lesson_resource_versions",
      "lesson_resource_files",
      "lesson_resource_reviews",
      "lesson_resource_events",
      "content_import_batches",
      "content_import_rows",
      "storage_operations",
      "idempotency_ledger",
    ];

    for (const tbl of requiredTables) {
      assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Migration missing table: ${tbl}`);
    }
  });

  it("should enforce canonical composite foreign keys for Same-Resource Integrity", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    const canonicalConstraints = [
      "uq_resource_version_id_resource",
      "fk_lesson_resources_current_draft_same_resource",
      "fk_lesson_resources_approved_same_resource",
      "fk_lesson_resources_published_same_resource",
    ];

    for (const c of canonicalConstraints) {
      assert.ok(sql.includes(c), `Migration missing canonical constraint: ${c}`);
    }
  });

  it("should declare all 11 required SECURITY DEFINER RPC functions", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    const rpcs = [
      "create_content_import_batch",
      "issue_content_upload",
      "finalize_content_upload",
      "validate_content_package",
      "submit_resource_for_review",
      "approve_resource_version",
      "reject_resource_version",
      "publish_resource_version",
      "unpublish_resource_version",
      "archive_lesson_resource",
      "rollback_published_resource_version",
      "fetch_published_lesson_resources",
    ];

    for (const rpc of rpcs) {
      assert.ok(sql.includes(`FUNCTION public.${rpc}`), `Migration missing RPC function: ${rpc}`);
    }
  });

  it("should enforce search_path = public, pg_temp on all RPC functions", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");
    const funcMatches = sql.match(/CREATE OR REPLACE FUNCTION public\.\w+/g) || [];
    assert.ok(funcMatches.length >= 11, "Expected at least 11 RPC functions");
    assert.ok(sql.includes("SET search_path = public, pg_temp"), "RPCs must set fixed search_path");
  });

  it("should configure Private Storage buckets (public = false)", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    assert.ok(sql.includes("'lesson-resource-drafts'"), "Drafts bucket missing");
    assert.ok(sql.includes("'lesson-resource-published'"), "Published bucket missing");
    assert.ok(sql.includes("SET public = false"), "Bucket must be set to private (public = false)");
  });

  it("should enforce explicit REVOKE and GRANT policies on RPCs", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    assert.ok(sql.includes("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC"), "Must revoke PUBLIC execution");
    assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.publish_resource_version TO authenticated"), "Must grant authenticated execution");
  });
});
