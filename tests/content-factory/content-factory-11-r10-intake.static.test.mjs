import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builder = readFileSync("src/components/admin/GoldenLessonPackageBuilder.tsx", "utf8");
const bundleFns = readFileSync("src/lib/content-factory/golden-lesson-bundle.functions.ts", "utf8");
const publication = readFileSync("src/lib/content-factory/golden-lesson-publication.server.ts", "utf8");

test("R10/1 — the factory UI reaches the server-side ZIP intake path", () => {
  assert.match(builder, /createGoldenLessonBundleUpload/);
  assert.match(builder, /verifyAndStageGoldenLessonBundle\(\{ data: \{ path: slot\.path \} \}\)/);
  assert.match(builder, /uploadToSignedUrl\(slot\.path, slot\.token, blob/);
});

test("R10/2 — the client never supplies hashes or byte counts to the intake server fn", () => {
  const call = builder.slice(builder.indexOf("uploadAndVerifyBundle"), builder.indexOf("</section>"));
  assert.doesNotMatch(call, /verifyAndStageGoldenLessonBundle\([\s\S]{0,200}sha256/i);
  assert.doesNotMatch(call, /bundleSha256|fileCount|compressedBytes/);
});

test("R10/3 — intake stays fail-closed and server-authoritative", () => {
  // Ownership check, server-side download, server-side verification, service-role attestation.
  assert.match(bundleFns, /BUNDLE_OWNER_MISMATCH/);
  assert.match(bundleFns, /await verifyGoldenLessonBundle\(bytes\)/);
  assert.match(bundleFns, /_bundle_sha256: verified\.bundleSha256/);
  assert.match(bundleFns, /_client_manifest_sha256: verified\.manifestSha256/);
  assert.match(bundleFns, /domainWritesPerformed: 0 as const/);
  // No READY / lifecycle promotion may be reachable from intake.
  assert.doesNotMatch(bundleFns, /attest_cf11_ready|lesson_capability_transition/);
});

test("R10/4 — batch reads use the real staged_at column, never created_at", () => {
  const read = publication.slice(
    publication.indexOf("golden_lesson_domain_stage_batches"),
    publication.indexOf("CF11_BATCHES_READ_FAILED"),
  );
  assert.match(read, /\.order\("staged_at"/);
  assert.doesNotMatch(read, /\\.order\\("created_at"/);
});
