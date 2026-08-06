import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260806120000_content_onboarding_html_operational_backend.sql"
);

describe("Operational HTML Content Backend Migration & Contract Tests (PR 19 Correction)", () => {
  it("should exist and be strictly additive (no DROP TABLE lesson_resources)", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    assert.ok(sql.includes("ALTER TABLE public.lesson_resources"), "Migration must use ALTER TABLE on lesson_resources");
    assert.equal(sql.includes("DROP TABLE public.lesson_resources"), false, "Migration MUST NOT drop lesson_resources");
    assert.equal(sql.includes("DROP TABLE lesson_resources"), false, "Migration MUST NOT drop lesson_resources");
    assert.equal(sql.includes("CREATE TABLE IF NOT EXISTS public.lesson_resources ("), false, "Migration MUST NOT recreate lesson_resources");
  });

  it("should include all 10 operational backend tables (including feature flags & server validations)", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    const requiredTables = [
      "content_feature_flags",
      "lesson_resource_versions",
      "lesson_resource_files",
      "lesson_resource_reviews",
      "lesson_resource_events",
      "content_import_batches",
      "content_import_rows",
      "storage_operations",
      "idempotency_ledger",
      "content_package_validations",
    ];

    for (const tbl of requiredTables) {
      assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Migration missing table: ${tbl}`);
    }
  });

  it("should enforce canonical composite foreign keys with ON DELETE RESTRICT", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    const canonicalConstraints = [
      "uq_resource_version_id_resource",
      "fk_lesson_resources_current_draft_same_resource",
      "fk_lesson_resources_approved_same_resource",
      "fk_lesson_resources_published_same_resource",
      "fk_reviews_version_same_resource",
    ];

    for (const c of canonicalConstraints) {
      assert.ok(sql.includes(c), `Migration missing canonical constraint: ${c}`);
    }

    assert.ok(sql.includes("ON DELETE RESTRICT"), "Composite pointers must use ON DELETE RESTRICT");
  });

  it("should declare all 12 required SECURITY DEFINER RPC functions", async () => {
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

    assert.equal(rpcs.length, 12, "RPC inventory count must be exactly 12");

    for (const rpc of rpcs) {
      assert.ok(sql.includes(`FUNCTION public.${rpc}`), `Migration missing RPC function: ${rpc}`);
    }
  });

  it("should enforce search_path = public, pg_temp on all RPC functions", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");
    const funcMatches = sql.match(/CREATE OR REPLACE FUNCTION public\.\w+/g) || [];
    assert.ok(funcMatches.length >= 12, "Expected at least 12 RPC functions");
    assert.ok(sql.includes("SET search_path = public, pg_temp"), "RPCs must set fixed search_path");
  });

  it("should configure Private Storage buckets (public = false)", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    assert.ok(sql.includes("'lesson-resource-drafts'"), "Drafts bucket missing");
    assert.ok(sql.includes("'lesson-resource-published'"), "Published bucket missing");
    assert.ok(sql.includes("SET public = false"), "Bucket must be set to private (public = false)");
  });

  it("should enforce per-function REVOKE and GRANT policies without wildcard REVOKE ALL ON SCHEMA", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    assert.equal(sql.includes("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public"), false, "Must NOT contain wildcard REVOKE ALL ON ALL FUNCTIONS");
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.publish_resource_version"), "Must use explicit function REVOKE");
    assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.publish_resource_version TO authenticated"), "Must grant authenticated execution");
  });
});
