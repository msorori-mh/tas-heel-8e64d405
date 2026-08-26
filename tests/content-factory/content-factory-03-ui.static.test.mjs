import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const component = readFileSync("src/components/admin/GoldenLessonManifestReviewPanel.tsx", "utf8");
const route = readFileSync("src/routes/_authenticated/admin.import.tsx", "utf8");

test("direct import is the active UI and retired review/release panels are not wired", () => {
  assert.match(route, /<GoldenLessonPackageBuilder \/>/);
  assert.doesNotMatch(route, /GoldenLessonManifestReviewPanel|GoldenLessonCf11OperatorPanel/);
  assert.doesNotMatch(
    route,
    /view=release|getHtmlReviewQueueFn|lesson_resources\.lifecycle_status/,
  );
});

test("review panel uses typed staging functions and exposes no direct RPC or execute path", () => {
  assert.match(component, /useServerFn/);
  assert.match(component, /stageGoldenLessonManifest/);
  assert.match(component, /advanceGoldenLessonReview/);
  assert.doesNotMatch(component, /\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(component, /runContentImportExecute|executeContentImport/);
  assert.match(component, /stageDomain/);
  assert.match(component, /bindIdentity/);
  assert.match(component, /automaticPreparation/);
});

test("manifest is hash-pinned, size-limited, dry-run checked, and role gated", () => {
  assert.match(component, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(component, /GOLDEN_PACKAGE_MAX_MANIFEST_BYTES/);
  assert.match(component, /previewGoldenLessonStaging/);
  assert.match(component, /advanceGoldenLessonReview/);
  assert.match(component, /packageValidationPassed/);
  assert.doesNotMatch(component, /id="golden-manifest-file"/);
});

test("panel remains RTL and mobile-first", () => {
  assert.match(component, /dir="rtl"/);
  assert.match(component, /grid-cols-1/);
  assert.ok((component.match(/min-h-\[44px\]/g) ?? []).length >= 2);
  assert.doesNotMatch(component, /<Database|owner-approval-reason/);
});
