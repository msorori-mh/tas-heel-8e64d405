import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const contract = readFileSync("src/lib/content-factory/golden-lesson-contract.ts", "utf8");
const validator = readFileSync("src/lib/content-factory/golden-lesson-validator.ts", "utf8");
const builder = readFileSync("src/components/admin/GoldenLessonPackageBuilder.tsx", "utf8");
const migration = readFileSync("supabase/migrations-pending/20260819190000_content_factory_04_package_staging.sql", "utf8");

test("official provenance is a byte-hashed artifact, not a typed path", () => {
  assert.match(contract, /provenanceSha256: string \| null/);
  assert.match(validator, /OFFICIAL_PROVENANCE_HASH_INVALID/);
  assert.match(migration, /OFFICIAL_PROVENANCE_HASH_INVALID/);
  assert.match(builder, /handleProvenanceFile/);
  assert.doesNotMatch(builder, /placeholder="مسار ملف توثيق المصدر/);
});

test("builder emits a portable ZIP containing manifest and actual files", () => {
  assert.match(builder, /import JSZip from "jszip"/);
  assert.match(builder, /zip\.file\("manifest\.json"/);
  assert.match(builder, /generateAsync/);
  assert.match(builder, /تنزيل حزمة ZIP/);
});

test("duplicate and unsafe package paths fail closed", () => {
  assert.match(validator, /PACKAGE_PATH_DUPLICATE/);
  assert.match(validator, /PACKAGE_PATH_UNSAFE/);
  assert.match(validator, /u0000/);
});
