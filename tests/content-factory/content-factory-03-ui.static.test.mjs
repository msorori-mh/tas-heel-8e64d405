import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const component = readFileSync("src/components/admin/GoldenLessonManifestReviewPanel.tsx", "utf8");
const route = readFileSync("src/routes/_authenticated/admin.import.tsx", "utf8");

test("manifest review panel is mounted after the package builder", () => {
  assert.match(route, /GoldenLessonManifestReviewPanel/);
  assert.ok(route.indexOf("<GoldenLessonPackageBuilder />") < route.indexOf("<GoldenLessonManifestReviewPanel />"));
});

test("review panel is client-only and exposes no execute or server mutation", () => {
  assert.doesNotMatch(component, /useServerFn|\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(component, /runContentImportExecute|executeContentImport/);
  assert.match(component, /domain writes: \{preview\.domainWritesPerformed\}/);
  assert.match(component, /0 writes/);
});

test("manifest is hash-pinned, size-limited, dry-run checked, and role gated", () => {
  assert.match(component, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(component, /GOLDEN_PACKAGE_MAX_MANIFEST_BYTES/);
  assert.match(component, /previewGoldenLessonStaging/);
  assert.match(component, /advanceGoldenLessonReview/);
  assert.match(component, /packageValidationPassed/);
});

test("panel remains RTL and mobile-first", () => {
  assert.match(component, /dir="rtl"/);
  assert.match(component, /grid-cols-1/);
  assert.ok((component.match(/min-h-\[44px\]/g) ?? []).length >= 4);
});
