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
