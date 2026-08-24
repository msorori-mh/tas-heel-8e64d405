import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL(
  "../../src/lib/content-factory/golden-lesson-direct.functions.ts",
  import.meta.url,
), "utf8");
const builder = readFileSync(new URL(
  "../../src/components/admin/GoldenLessonPackageBuilder.tsx",
  import.meta.url,
), "utf8");
const directPublish = readFileSync(new URL(
  "../../src/lib/content-factory/golden-lesson-direct-publish.functions.ts",
  import.meta.url,
), "utf8");

test("preflight runs before signed upload URLs are issued", () => {
  const createStart = source.indexOf("export const createGoldenLessonDirectUpload");
  const preflightCall = source.indexOf("readDirectIntakePreflight(authContext, manifest)", createStart);
  const signedUpload = source.indexOf("createSignedUploadUrl", createStart);
  assert.ok(createStart >= 0 && preflightCall > createStart && signedUpload > preflightCall);
});

test("direct intake handles conflict, resume, safe rebind and exact cleanup", () => {
  assert.match(source, /IDENTITY_CONFLICT/);
  assert.match(source, /RESUMABLE/);
  assert.match(source, /golden_lesson_rebind_draft_identity/);
  assert.match(source, /discardDirectUpload/);
  assert.match(source, /databaseWritesStarted/);
  assert.match(source, /storageObjectName\(declaration, index\)/);
});

test("raw immutable RPC error is no longer the primary conflict path", () => {
  assert.match(source, /describeGoldenIdentityConflictAr/);
  assert.match(source, /تعذر النشر لأن كود الحزمة مستخدم بهوية مختلفة/);
});

test("publish UI preflights, resumes and presents identity differences", () => {
  assert.match(builder, /preflightGoldenLessonDirect/);
  assert.match(builder, /preflight\.status === "RESUMABLE"/);
  assert.match(builder, /جاهزية النشر على الخادم/);
  assert.match(builder, /difference\.currentValue/);
  assert.match(builder, /discardGoldenLessonDirectUpload/);
});

test("an existing exact identity under another code is reused before upload", () => {
  assert.match(source, /resolveExistingIdentityPackage/);
  assert.match(source, /\.eq\("profile_id", manifest\.profileId\)/);
  assert.match(source, /diffGoldenLessonIdentity\(candidate\.identity, manifest\.identity\)\.length === 0/);
  assert.match(source, /PACKAGE_IDENTITY_AMBIGUOUS/);
  assert.ok((source.match(/await resolveExistingIdentityPackage\(/g) ?? []).length >= 3);
});


test("CF11 replay resumes with the immutable persisted publication plan hash", () => {
  const dryRunPlan = directPublish.indexOf('planSha(dryPublish, "plan_sha256")');
  const ledgerRead = directPublish.indexOf('.from("golden_lesson_publications")', dryRunPlan);
  const ledgerPlan = directPublish.indexOf(
    'planSha(persistedPublication.data, "plan_sha256")',
    ledgerRead,
  );
  const execute = directPublish.indexOf('_mode: "EXECUTE"', ledgerPlan);

  assert.ok(dryRunPlan >= 0 && ledgerRead > dryRunPlan && ledgerPlan > ledgerRead);
  assert.ok(execute > ledgerPlan, "the durable replay hash must be recovered before EXECUTE");
  assert.match(directPublish, /CF11_PUBLICATION_PLAN_READ_FAILED/);
  assert.match(directPublish, /if \(!publishPlan\) throw new Error\("CF11_WRITE_PLAN_HASH_REQUIRED"\)/);
});
