import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const contract = readFileSync("src/lib/content-factory/golden-lesson-contract.ts", "utf8");
const validator = readFileSync("src/lib/content-factory/golden-lesson-validator.ts", "utf8");
const builder = readFileSync("src/components/admin/GoldenLessonPackageBuilder.tsx", "utf8");
const directFunctions = readFileSync(
  "src/lib/content-factory/golden-lesson-direct.functions.ts",
  "utf8",
);
const componentV2 = readFileSync(
  "src/lib/content-factory/lesson-component-publishing-v2.functions.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations-pending/20260819190000_content_factory_04_package_staging.sql",
  "utf8",
);

test("V2 pins the lesson and exact source hash without an extra provenance upload", () => {
  assert.match(contract, /provenanceSha256: string \\| null/);
  assert.match(validator, /OFFICIAL_PROVENANCE_HASH_INVALID/);
  assert.match(migration, /OFFICIAL_PROVENANCE_HASH_INVALID/);
  assert.match(componentV2, /source_sha256/);
  assert.match(componentV2, /lesson_component_create_intake_v2/);
  assert.doesNotMatch(builder, /internalProvenance/);
  assert.doesNotMatch(builder, /handleProvenanceFile/);
  assert.doesNotMatch(builder, /golden-provenance-/);
});

test("builder uploads declared files directly and never creates a lesson ZIP", () => {
  assert.match(builder, /createLessonComponentV2Upload/);
  assert.match(builder, /uploadToSignedUrl/);
  assert.match(builder, /verifyLessonComponentV2Upload/);
  assert.match(builder, /publishLessonComponentV2/);
  assert.doesNotMatch(builder, /import JSZip from "jszip"/);
  assert.doesNotMatch(builder, /buildPackageZipBlob/);
  assert.doesNotMatch(builder, /تنزيل حزمة ZIP/);
  assert.match(directFunctions, /createSignedUploadUrl/);
  assert.match(directFunctions, /verifyGoldenLessonDirectIntake/);
  assert.match(componentV2, /createSignedUploadUrl/);
  assert.match(componentV2, /validateGoldenLessonArtifactBytes/);
});

test("an optional HTML5 activity ZIP is converted locally, not uploaded as the lesson package", () => {
  assert.match(builder, /convertHtml5ActivityZip/);
  assert.match(builder, /LCPV2_FILE_TYPE_UNSUPPORTED/);
});

test("duplicate and unsafe package paths fail closed", () => {
  assert.match(validator, /PACKAGE_PATH_DUPLICATE/);
  assert.match(validator, /PACKAGE_PATH_UNSAFE/);
  assert.ok(validator.includes('character === "/"'));
  assert.ok(validator.includes('character === "\\\\"'));
  assert.match(validator, /codePoint <= 0x1f/);
});
