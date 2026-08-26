import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builder = readFileSync("src/components/admin/GoldenLessonPackageBuilder.tsx", "utf8");
const directFns = readFileSync("src/lib/content-factory/golden-lesson-direct.functions.ts", "utf8");
const publication = readFileSync(
  "src/lib/content-factory/golden-lesson-publication.server.ts",
  "utf8",
);

test("R10/1 — the factory UI reaches the server-side direct-file intake path", () => {
  assert.match(
    builder,
    /createGoldenLessonDirectUpload\(\{ data: \{ manifest: packageDraft \} \}\)/,
  );
  assert.match(builder, /uploadToSignedUrl\(upload\.storagePath, upload\.token, file/);
  assert.match(
    builder,
    /verifyAndStageGoldenLessonDirect\(\{[\s\S]*intakeId: slot\.intakeId, manifest: packageDraft/,
  );
  assert.doesNotMatch(builder, /createGoldenLessonBundleUpload|uploadAndVerifyBundle/);
});

test("R10/2 — the client never supplies authoritative intake totals to the server", () => {
  const call = builder.slice(
    builder.indexOf("uploadAndVerifyDirectIntake"),
    builder.indexOf("return ("),
  );
  assert.doesNotMatch(call, /verifiedFileCount|intakeSha256|totalBytes|compressedBytes/);
});

test("R10/3 — direct intake stays fail-closed and server-authoritative", () => {
  assert.match(
    directFns,
    /\$\{userId\}\/\$\{data\.intakeId\}\/\$\{storageObjectName\(declaration, index\)\}/,
  );
  assert.match(directFns, /\.download\(storagePath\)/);
  assert.match(directFns, /verifyGoldenLessonDirectIntake\(manifest, files\)/);
  assert.match(directFns, /golden_lesson_attest_direct_intake/);
  assert.match(directFns, /domainWritesPerformed: 0 as const/);
  assert.doesNotMatch(directFns, /attest_cf11_ready|lesson_capability_transition/);
});

test("R10/4 — batch reads use the real staged_at column, never created_at", () => {
  const read = publication.slice(
    publication.indexOf("golden_lesson_domain_stage_batches"),
    publication.indexOf("CF11_BATCHES_READ_FAILED"),
  );
  assert.match(read, /\.order\("staged_at"/);
  assert.ok(!read.includes('.order("created_at")'));
});
