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
const migration = readFileSync(
  "supabase/migrations-pending/20260819190000_content_factory_04_package_staging.sql",
  "utf8",
);

test("official provenance remains internally hash-pinned without an operator upload field", () => {
  assert.match(contract, /provenanceSha256: string \\| null/);
  assert.match(validator, /OFFICIAL_PROVENANCE_HASH_INVALID/);
  assert.match(migration, /OFFICIAL_PROVENANCE_HASH_INVALID/);
  assert.match(builder, /internalProvenance/);
  assert.doesNotMatch(builder, /handleProvenanceFile/);
  assert.doesNotMatch(builder, /golden-provenance-/);
});

test("builder uploads declared files directly and never creates a lesson ZIP", () => {
  assert.match(builder, /createGoldenLessonDirectUpload/);
  assert.match(builder, /uploadToSignedUrl/);
  assert.match(builder, /verifyAndStageGoldenLessonDirect/);
  assert.doesNotMatch(builder, /import JSZip from "jszip"/);
  assert.doesNotMatch(builder, /buildPackageZipBlob/);
  assert.doesNotMatch(builder, /تنزيل حزمة ZIP/);
  assert.match(directFunctions, /createSignedUploadUrl/);
  assert.match(directFunctions, /verifyGoldenLessonDirectIntake/);
});

test("an optional HTML5 activity ZIP is converted locally, not uploaded as the lesson package", () => {
  assert.match(builder, /convertHtml5ActivityZip/);
  assert.match(builder, /DIRECT_FILE_TYPE_UNSUPPORTED/);
});

test("duplicate and unsafe package paths fail closed", () => {
  assert.match(validator, /PACKAGE_PATH_DUPLICATE/);
  assert.match(validator, /PACKAGE_PATH_UNSAFE/);
  assert.ok(validator.includes('character === "/"'));
  assert.ok(validator.includes('character === "\\\\"'));
  assert.match(validator, /codePoint <= 0x1f/);
});
