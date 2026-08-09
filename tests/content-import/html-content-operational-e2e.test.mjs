/**
 * HTML Content Operational E2E Test Harness
 *
 * Closes the full operational path for trusted HTML lesson resources:
 *   Real XLSX → Real ZIP → Admin Import → Signed Upload → Local Supabase Storage
 *   → Stored-byte Validation → Draft → Submit → Review → Approve
 *   → Storage Promotion → Atomic Publication → Student Enumeration
 *   → Signed Access → Unpublish → V2/Republish → Rollback
 *   → Negative Authorization Matrix → Failure/Retry Matrix
 *
 * Run:
 *   node --test tests/content-import/html-content-operational-e2e.test.mjs
 *   npm run test:html-content-e2e
 *
 * Prerequisites:
 *   - Local Supabase is running (http://127.0.0.1:54421)
 *   - .env.local contains SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - Fixtures generated: node tests/content-import/fixtures/generate-html-e2e-fixtures.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "../../src/integrations/supabase/client.server.ts";
import { createHtmlWorkflowAdapter } from "../../src/lib/server/html-pipeline/html-workflow-adapter.ts";
import { createSupabaseDbAdapter } from "../../src/lib/server/html-pipeline/db-adapter.ts";
import {
  createSignedUploadUrl,
  downloadAndValidateStoredZip,
  promoteApprovedPackage,
  createSignedStudentAccessUrl,
} from "../../src/lib/server/html-pipeline/html-pipeline-service.ts";
import { defaultSupabaseStorageAdapter } from "../../src/lib/server/html-pipeline/storage-adapter.ts";
import {
  parseMasterZipBuffer,
  computePackageDeterministicHash,
} from "../../src/lib/content-import/html-package/index.ts";
import { validateServerHtmlPackage } from "../../src/lib/server/html-pipeline/package-validator.ts";
import { parseContentImportBuffer } from "../../src/lib/content-import/content-import-dry-run.server.ts";
import { validateInteractiveRow } from "../../src/lib/api/html-workflow.functions.ts";

import {
  FIXTURE_DIR,
  TEST_PREFIX,
  DETERMINISTIC,
  RESOURCES,
  LESSON_CODE,
  DRAFTS_BUCKET,
  PUBLISHED_BUCKET,
  fixturePath,
  loadFixtureBytes,
  ensureServiceRoleGrants,
  ensureLocalActorWrappers,
  buildMinimalValidZip,
  uploadBytesToSignedUrl,
  createAuthUser,
  buildAuthenticatedClient,
  resetTestData,
  seedTestData,
  assertFeatureFlagsEnabled,
} from "./html-operational-e2e-helpers.mjs";

async function computeCanonicalHash(zipBytes) {
  const parseRes = await parseMasterZipBuffer(zipBytes);
  assert.equal(parseRes.isValid, true, "ZIP must parse for canonical hash computation");
  const packageFiles =
    parseRes.packageMap["package"] || Object.values(parseRes.packageMap)[0] || [];
  assert.ok(packageFiles.length > 0, "Package must contain files");
  return computePackageDeterministicHash(packageFiles);
}

async function importAndPublishResource(ctx, resource, versionNumber, zipBytes, useV2 = false) {
  const packageHash = await computeCanonicalHash(zipBytes);

  const resourceId = await ctx.workflow.findOrCreateResource({
    lesson_id: DETERMINISTIC.lessonId,
    resource_type: resource.type,
    title: resource.title,
    description: `${TEST_PREFIX} description`,
    sort_order: resource.sortOrder,
    resource_code: resource.code,
  });

  const manifest = {
    resource_code: resource.code,
    resource_type: resource.type,
    version: versionNumber,
    entry_file: "index.html",
    offline_enabled: true,
    required_files: ["index.html", "style.css", "app.js"],
    content_sha256: packageHash,
  };

  const versionId = await ctx.workflow.createResourceVersion({
    resource_id: resourceId,
    version_number: versionNumber,
    content_sha256: packageHash,
    manifest,
    created_by: DETERMINISTIC.contentManagerId,
  });

  const batchId = await ctx.workflow.createImportBatch({
    actor_id: DETERMINISTIC.contentManagerId,
    idempotency_key: `${resource.code}-v${versionNumber}-${crypto.randomUUID()}`,
  });

  const stagingPath = `html-packages/staging/${resource.code}-v${versionNumber}-${crypto.randomUUID()}.zip`;
  const sessionId = await ctx.workflow.createUploadSession({
    batch_id: batchId,
    actor_id: DETERMINISTIC.contentManagerId,
    resource_id: resourceId,
    resource_code: resource.code,
    staging_path: stagingPath,
    expected_package_hash: packageHash,
    original_filename: `${resource.code}.zip`,
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  });

  const signed = await createSignedUploadUrl(sessionId, ctx.adminDbAdapter, ctx.storageAdapter);
  assert.equal(signed.bucket, DRAFTS_BUCKET, "Signed upload must target drafts bucket");
  assert.equal(signed.stagingPath, stagingPath, "Signed upload path must match session");

  await uploadBytesToSignedUrl(signed.signedUploadUrl, zipBytes);

  const { data: storedBytes, error: storedErr } = await ctx.storageAdapter.download(
    DRAFTS_BUCKET,
    stagingPath,
  );
  assert.ifError(storedErr);
  assert.ok(storedBytes && storedBytes.byteLength > 0, "Stored object must exist after upload");

  const validationResult = await downloadAndValidateStoredZip(
    sessionId,
    versionId,
    ctx.adminDbAdapter,
    ctx.storageAdapter,
  );
  assert.equal(
    validationResult.isValid,
    true,
    `Stored-byte validation must pass for ${resource.code}: ${validationResult.findings
      .map((f) => f.message)
      .join(", ")}`,
  );
  assert.equal(validationResult.packageHash, packageHash, "Validation hash must match");
  assert.ok(validationResult.validationId, "Validation record must be created");

  if (useV2) {
    await setDraftVersionOnApprovedResource(resourceId, versionId);
  } else {
    await ctx.workflow.setResourceDraftVersion(resourceId, versionId);
  }
  await submitWithActor(resourceId);
  await approveWithActor(resourceId, versionId);

  const promoteResult = await promoteApprovedPackage(
    { uploadSessionId: sessionId },
    DETERMINISTIC.adminId,
    ctx.adminDbAdapter,
    ctx.storageAdapter,
  );
  assert.equal(
    promoteResult.promoted,
    true,
    `Promotion must succeed for ${resource.code}: ${promoteResult.errorDetails}`,
  );
  assert.equal(promoteResult.status, "promoted", "Promotion status must be promoted");

  const publishedPath = `published/${resourceId}/${versionNumber}`;
  const { data: publishedBytes, error: publishedErr } = await ctx.storageAdapter.download(
    PUBLISHED_BUCKET,
    publishedPath,
  );
  assert.ifError(publishedErr);
  assert.ok(publishedBytes && publishedBytes.byteLength > 0, "Published object must exist");

  const existing = ctx.resources.get(resource.code);
  if (useV2 && existing) {
    existing.v2VersionId = versionId;
    existing.v2SessionId = sessionId;
    existing.v2PackageHash = packageHash;
    existing.v2StagingPath = stagingPath;
    return existing;
  }

  const rc = {
    id: resourceId,
    versionId,
    sessionId,
    packageHash,
    stagingPath,
    publishedPath,
  };
  ctx.resources.set(resource.code, rc);
  return rc;
}

async function setDraftVersionOnApprovedResource(resourceId, versionId) {
  const { error } = await supabaseAdmin
    .from("lesson_resources")
    .update({ lifecycle_status: "draft", current_draft_version_id: versionId })
    .eq("id", resourceId);
  if (error) throw new Error(error.message);
}

async function submitWithActor(resourceId, lockVersion) {
  const { error } = await supabaseAdmin.rpc("submit_resource_for_review_with_actor", {
    p_resource_id: resourceId,
    p_expected_lock_version: lockVersion ?? null,
    p_actor_id: DETERMINISTIC.contentManagerId,
  });
  if (error) throw new Error(error.message);
}

async function approveWithActor(resourceId, versionId, lockVersion) {
  const { error } = await supabaseAdmin.rpc("approve_resource_with_actor", {
    p_resource_id: resourceId,
    p_version_id: versionId,
    p_expected_lock_version: lockVersion ?? null,
    p_actor_id: DETERMINISTIC.adminId,
  });
  if (error) throw new Error(error.message);
}

async function unpublishWithActor(resourceId, lockVersion) {
  const { error } = await supabaseAdmin.rpc("unpublish_resource_with_actor", {
    p_resource_id: resourceId,
    p_expected_lock_version: lockVersion ?? null,
    p_actor_id: DETERMINISTIC.adminId,
  });
  if (error) throw new Error(error.message);
}

async function rollbackWithActor(resourceId, targetVersionId, lockVersion) {
  const { error } = await supabaseAdmin.rpc("rollback_resource_with_actor", {
    p_resource_id: resourceId,
    p_target_version_id: targetVersionId,
    p_expected_lock_version: lockVersion,
    p_actor_id: DETERMINISTIC.adminId,
  });
  if (error) throw new Error(error.message);
}

async function callRpcExpectDeny(client, fn, args) {
  const { error } = await client.rpc(fn, args);
  assert.ok(error, `Expected ${fn} to be denied`);
  const msg = error.message.toLowerCase();
  assert.ok(
    msg.includes("permission") ||
      msg.includes("denied") ||
      msg.includes("unauthorized") ||
      msg.includes("admin role required") ||
      msg.includes("content manager or admin role required") ||
      msg.includes("only service_role") ||
      msg.includes("not published") ||
      msg.includes("not found"),
    `Expected denial message for ${fn}, got: ${error.message}`,
  );
}

async function callRpcExpectOk(client, fn, args) {
  const { error } = await client.rpc(fn, args);
  assert.ifError(error);
}

describe("HTML Content Operational E2E", () => {
  const rawAdminDbAdapter = createSupabaseDbAdapter({
    userClient: supabaseAdmin,
    adminClient: supabaseAdmin,
  });
  const adminDbAdapter = new Proxy(rawAdminDbAdapter, {
    get(target, prop) {
      if (prop === "recordSuccessfulResourcePublication") {
        return async (params) => {
          const { error } = await supabaseAdmin.rpc(
            "record_successful_resource_publication_with_actor",
            {
              p_resource_id: params.resourceId,
              p_version_id: params.versionId,
              p_storage_operation_id: params.storageOperationId,
              p_expected_lock_version: params.expectedLockVersion,
              p_upload_session_id: params.uploadSessionId ?? null,
              p_actor_id: DETERMINISTIC.adminId,
            },
          );
          if (error) throw new Error(error.message);
        };
      }
      return target[prop];
    },
  });

  const ctx = {
    adminDbAdapter,
    storageAdapter: defaultSupabaseStorageAdapter,
    workflow: createHtmlWorkflowAdapter(supabaseAdmin),
    resources: new Map(),
    anonClient: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    studentClient: null,
    contentManagerClient: null,
  };

  before(async () => {
    await ensureServiceRoleGrants();
    await resetTestData();
    await seedTestData();
    await ensureLocalActorWrappers();

    ctx.studentClient = await buildAuthenticatedClient(
      "student-html-e2e@test.local",
      "Password123!",
    );
    ctx.contentManagerClient = await buildAuthenticatedClient(
      "cm-html-e2e@test.local",
      "Password123!",
    );

    ctx.dbAdapter = createSupabaseDbAdapter({
      userClient: ctx.studentClient,
      adminClient: supabaseAdmin,
    });

    await assertFeatureFlagsEnabled();
  });

  after(async () => {
    if (!process.env.SKIP_HTML_E2E_CLEANUP) {
      await resetTestData();
    }
  });

  it("1. Real XLSX fixture parses through production parser", async () => {
    const xlsxBytes = loadFixtureBytes("valid-resources.xlsx");
    const parsed = await parseContentImportBuffer(
      Buffer.from(xlsxBytes),
      "valid-resources.xlsx",
      "resources",
    );

    assert.ok(parsed.rows?.length >= 3, "XLSX must contain at least 3 resource rows");
    const codes = parsed.rows.map((r) => r.data?.resource_code);
    for (const expected of ["TEST_MM_E2E_001", "TEST_EXP_E2E_001", "TEST_SUM_E2E_001"]) {
      assert.ok(codes.includes(expected), `XLSX must include ${expected}`);
    }

    for (const r of parsed.rows) {
      const validation = validateInteractiveRow(r.rowNumber, r.data);
      assert.equal(validation.valid, true, `Row ${r.data.resource_code} must be valid`);
    }
  });

  it("1b. Real XLSX scope resolves to the correct lesson via production lookup", async () => {
    const xlsxBytes = loadFixtureBytes("valid-resources.xlsx");
    const parsed = await parseContentImportBuffer(
      Buffer.from(xlsxBytes),
      "valid-resources.xlsx",
      "resources",
    );

    const requests = parsed.rows.map((r) => ({
      grade_code: r.data.grade_code,
      subject_code: r.data.subject_code,
      lesson_code: r.data.lesson_code,
    }));

    const map = await ctx.workflow.lookupLessonsByCode(requests);

    for (const r of parsed.rows) {
      const key = `${r.data.grade_code}|${r.data.subject_code}|${r.data.lesson_code}`;
      assert.ok(map.has(key), `XLSX row ${r.data.resource_code} must resolve to a lesson`);
      assert.equal(
        map.get(key).id,
        DETERMINISTIC.lessonId,
        `XLSX row ${r.data.resource_code} must resolve to the seeded lesson`,
      );
    }
  });

  it("2. Invalid fixtures fail parser validation", async () => {
    const malformedZip = loadFixtureBytes("invalid", "malformed-zip.zip");
    const malformedParse = await parseMasterZipBuffer(malformedZip);
    assert.equal(malformedParse.isValid, false, "Malformed ZIP must fail ingestion");

    const invalidEntry = loadFixtureBytes("invalid", "invalid-entry.zip");
    const invalidEntryVal = await validateServerHtmlPackage(
      invalidEntry,
      "TEST_MM_E2E_001",
      "TEST_MM_E2E_001",
    );
    assert.equal(invalidEntryVal.isValid, false, "Invalid entry must fail validation");

    const prohibitedJs = loadFixtureBytes("invalid", "prohibited-js.zip");
    const prohibitedJsVal = await validateServerHtmlPackage(
      prohibitedJs,
      "TEST_MM_E2E_001",
      "TEST_MM_E2E_001",
    );
    assert.equal(prohibitedJsVal.isValid, false, "Prohibited JS must fail validation");

    const invalidSubtype = loadFixtureBytes("invalid", "invalid-subtype.zip");
    const invalidSubtypeVal = await validateServerHtmlPackage(
      invalidSubtype,
      "TEST_MM_E2E_001",
      "TEST_MM_E2E_001",
    );
    assert.equal(invalidSubtypeVal.isValid, false, "Invalid subtype must fail validation");
  });

  it("3. Positive path: import, validate, submit, approve, promote and publish three HTML resources", async () => {
    for (const resource of RESOURCES) {
      const zipBytes = loadFixtureBytes("valid", `${resource.code}.zip`);
      await importAndPublishResource(ctx, resource, 1, zipBytes);
    }

    for (const resource of RESOURCES) {
      const rc = ctx.resources.get(resource.code);
      const { data: row, error } = await supabaseAdmin
        .from("lesson_resources")
        .select(
          "lifecycle_status,published_version_id,approved_version_id,current_draft_version_id,html_resource_type,resource_code",
        )
        .eq("id", rc.id)
        .single();
      assert.ifError(error);
      assert.equal(row.lifecycle_status, "published");
      assert.equal(row.published_version_id, rc.versionId);
      assert.equal(row.approved_version_id, rc.versionId);
      assert.equal(row.html_resource_type, resource.type);
      assert.equal(row.resource_code, resource.code.toLowerCase());
    }
  });

  it("4. Student enumeration sees published HTML resources", async () => {
    const published = await ctx.dbAdapter.listLessonPublishedHtmlResources(DETERMINISTIC.lessonId);
    const codes = published.map((r) => r.resource_code?.toLowerCase());
    assert.equal(published.length, 3, "Student enumeration must return 3 published resources");
    for (const resource of RESOURCES) {
      assert.ok(
        codes.includes(resource.code.toLowerCase()),
        `Enumeration must include ${resource.code}`,
      );
    }
  });

  it("5. Student signed access grants signed URL for published resource", async () => {
    const rc = ctx.resources.get("TEST_MM_E2E_001");
    const access = await createSignedStudentAccessUrl(
      { resourceId: rc.id },
      ctx.dbAdapter,
      ctx.storageAdapter,
    );
    assert.equal(access.granted, true, "Signed access must be granted");
    assert.ok(access.signedUrl, "Signed URL must be present");
    assert.equal(access.expiresInSeconds, 900, "Signed URL TTL must be server-controlled");

    const response = await fetch(access.signedUrl);
    assert.equal(response.ok, true, "Signed URL must return the published object");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.byteLength > 0, "Signed URL must return non-empty bytes");
  });

  it("6. Unpublish removes resource from student enumeration", async () => {
    const rc = ctx.resources.get("TEST_MM_E2E_001");
    const { data: before } = await supabaseAdmin
      .from("lesson_resources")
      .select("lock_version")
      .eq("id", rc.id)
      .single();

    await unpublishWithActor(rc.id, before.lock_version);

    const { data: after } = await supabaseAdmin
      .from("lesson_resources")
      .select("lifecycle_status,published_version_id,approved_version_id")
      .eq("id", rc.id)
      .single();
    assert.equal(after.lifecycle_status, "approved");
    assert.equal(after.published_version_id, null);
    assert.equal(after.approved_version_id, rc.versionId);

    const published = await ctx.dbAdapter.listLessonPublishedHtmlResources(DETERMINISTIC.lessonId);
    assert.equal(published.length, 2, "After unpublish, only 2 resources remain published");
    assert.ok(
      !published.some((r) => r.resource_code?.toLowerCase() === "test_mm_e2e_001"),
      "Unpublished resource must not be enumerated",
    );

    let denied = false;
    try {
      await createSignedStudentAccessUrl({ resourceId: rc.id }, ctx.dbAdapter, ctx.storageAdapter);
    } catch (err) {
      denied = true;
      assert.match(
        err.message,
        /is not published/,
        "Unpublished resource access must throw a not-published error",
      );
    }
    assert.equal(denied, true, "Signed access must throw for unpublished resource");
  });

  it("7. V2 creation, republish, and rollback", async () => {
    const resource = RESOURCES[0];
    const rc = ctx.resources.get(resource.code);

    const v2Bytes = loadFixtureBytes("v2", `${resource.code}_v2.zip`);
    await importAndPublishResource(ctx, resource, 2, v2Bytes, true);

    const { data: afterV2 } = await supabaseAdmin
      .from("lesson_resources")
      .select("lifecycle_status,published_version_id,lock_version")
      .eq("id", rc.id)
      .single();
    assert.equal(afterV2.lifecycle_status, "published");
    assert.equal(afterV2.published_version_id, rc.v2VersionId);

    const publishedV2 = await ctx.dbAdapter.listLessonPublishedHtmlResources(
      DETERMINISTIC.lessonId,
    );
    assert.ok(
      publishedV2.some((r) => r.resource_code?.toLowerCase() === resource.code.toLowerCase()),
      "V2 resource must be enumerated",
    );

    await rollbackWithActor(rc.id, rc.versionId, afterV2.lock_version);

    const { data: afterRollback } = await supabaseAdmin
      .from("lesson_resources")
      .select("lifecycle_status,published_version_id")
      .eq("id", rc.id)
      .single();
    assert.equal(afterRollback.lifecycle_status, "published");
    assert.equal(afterRollback.published_version_id, rc.versionId);

    const publishedRollback = await ctx.dbAdapter.listLessonPublishedHtmlResources(
      DETERMINISTIC.lessonId,
    );
    assert.ok(
      publishedRollback.some((r) => r.resource_code?.toLowerCase() === resource.code.toLowerCase()),
      "Rolled-back v1 resource must still be enumerated",
    );
  });

  it("8. Negative authorization matrix", async () => {
    const rc = ctx.resources.get("TEST_SUM_E2E_001");

    await callRpcExpectDeny(ctx.anonClient, "submit_resource_for_review", {
      p_resource_id: rc.id,
    });
    await callRpcExpectDeny(ctx.anonClient, "approve_resource", {
      p_resource_id: rc.id,
      p_version_id: rc.versionId,
    });
    await callRpcExpectDeny(ctx.anonClient, "unpublish_resource", { p_resource_id: rc.id });

    await callRpcExpectDeny(ctx.studentClient, "submit_resource_for_review", {
      p_resource_id: rc.id,
    });
    await callRpcExpectDeny(ctx.studentClient, "approve_resource", {
      p_resource_id: rc.id,
      p_version_id: rc.versionId,
    });
    await callRpcExpectDeny(ctx.studentClient, "unpublish_resource", { p_resource_id: rc.id });

    await callRpcExpectDeny(ctx.contentManagerClient, "approve_resource", {
      p_resource_id: rc.id,
      p_version_id: rc.versionId,
    });
    await callRpcExpectDeny(ctx.contentManagerClient, "unpublish_resource", {
      p_resource_id: rc.id,
    });
  });

  it("9. Failure / retry matrix", async () => {
    const resource = RESOURCES[1];
    const zipBytes = await buildMinimalValidZip(`${resource.code}_FAIL`, resource.type);
    const packageHash = await computeCanonicalHash(zipBytes);

    const resourceId = await ctx.workflow.findOrCreateResource({
      lesson_id: DETERMINISTIC.lessonId,
      resource_type: resource.type,
      title: `${TEST_PREFIX} Failure Matrix ${resource.title}`,
      description: `${TEST_PREFIX} description`,
      sort_order: resource.sortOrder + 10,
      resource_code: `${resource.code}_FAIL`,
    });

    const versionId = await ctx.workflow.createResourceVersion({
      resource_id: resourceId,
      version_number: 1,
      content_sha256: packageHash,
      manifest: {
        resource_code: `${resource.code}_FAIL`,
        resource_type: resource.type,
        version: 1,
        entry_file: "index.html",
        offline_enabled: true,
        required_files: ["index.html"],
        content_sha256: packageHash,
      },
      created_by: DETERMINISTIC.contentManagerId,
    });

    const batchId = await ctx.workflow.createImportBatch({
      actor_id: DETERMINISTIC.contentManagerId,
      idempotency_key: `${resource.code}_FAIL-${crypto.randomUUID()}`,
    });

    const stagingPath = `html-packages/staging/${resource.code}_FAIL-${crypto.randomUUID()}.zip`;
    const sessionId = await ctx.workflow.createUploadSession({
      batch_id: batchId,
      actor_id: DETERMINISTIC.contentManagerId,
      resource_id: resourceId,
      resource_code: `${resource.code}_FAIL`,
      staging_path: stagingPath,
      expected_package_hash: packageHash,
      original_filename: `${resource.code}_FAIL.zip`,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const signed = await createSignedUploadUrl(sessionId, ctx.adminDbAdapter, ctx.storageAdapter);
    await uploadBytesToSignedUrl(signed.signedUploadUrl, zipBytes);

    const validationResult = await downloadAndValidateStoredZip(
      sessionId,
      versionId,
      ctx.adminDbAdapter,
      ctx.storageAdapter,
    );
    assert.equal(validationResult.isValid, true, "Failure matrix resource must validate");

    await ctx.workflow.setResourceDraftVersion(resourceId, versionId);

    let threw = false;
    try {
      await submitWithActor(resourceId, 9999);
    } catch (err) {
      threw = true;
      assert.ok(
        err.message.toLowerCase().includes("lock version") ||
          err.message.toLowerCase().includes("concurrent"),
        `Stale CAS submit must raise lock mismatch: ${err.message}`,
      );
    }
    assert.equal(threw, true, "Stale CAS submit must be denied");

    await submitWithActor(resourceId);
    await approveWithActor(resourceId, versionId);

    let badPromoteThrew = false;
    try {
      await promoteApprovedPackage(
        { uploadSessionId: crypto.randomUUID() },
        DETERMINISTIC.adminId,
        ctx.adminDbAdapter,
        ctx.storageAdapter,
      );
    } catch (err) {
      badPromoteThrew = true;
    }
    assert.equal(badPromoteThrew, true, "Promotion with bad session must fail");

    const promoteResult = await promoteApprovedPackage(
      { uploadSessionId: sessionId },
      DETERMINISTIC.adminId,
      ctx.adminDbAdapter,
      ctx.storageAdapter,
    );
    assert.equal(promoteResult.promoted, true, "Promotion must succeed after failure matrix");
  });

  it("10. Database and storage integrity assertions", async () => {
    const { data: versions } = await supabaseAdmin
      .from("lesson_resource_versions")
      .select("id,immutable_at,resource_id,version_number,content_sha256");

    for (const v of versions ?? []) {
      assert.ok(v.immutable_at, `Version ${v.id} must be immutable after publication`);
    }

    const { data: ops } = await supabaseAdmin
      .from("storage_operations")
      .select("status,operation_type,target_path,expected_hash");

    const promotedOps = (ops ?? []).filter(
      (o) =>
        o.operation_type === "promote_published" &&
        (o.status === "promoted" || o.status === "cleaned"),
    );
    assert.ok(promotedOps.length >= 3, "At least 3 promoted/cleaned storage operations must exist");

    for (const o of promotedOps) {
      assert.ok(o.target_path.startsWith("published/"), "Promoted path must be canonical");
      assert.ok(o.expected_hash, "Promoted operation must record expected hash");
    }

    const { data: events } = await supabaseAdmin
      .from("lesson_resource_events")
      .select("event_type");
    const eventTypes = new Set((events ?? []).map((e) => e.event_type));
    for (const t of ["submit", "approve", "publish", "unpublish", "rollback"]) {
      assert.ok(eventTypes.has(t), `Audit event ${t} must exist`);
    }
  });
});
