import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const vite = readFileSync("vite.config.ts", "utf8");
const release = readFileSync("src/lib/release-info.ts", "utf8");
const build = readFileSync("scripts/release/build-release.ts", "utf8");
const admin = readFileSync("src/routes/_authenticated/admin.index.tsx", "utf8");
const diagnostics = readFileSync("src/components/admin/ReleaseDiagnostics.tsx", "utf8");

test("the build embeds Git provenance and a computed portable source identity", () => {
  assert.match(vite, /buildRelease\(process\.cwd\(\)\)/);
  assert.match(build, /GITHUB_SHA/);
  assert.match(build, /git\(\["rev-parse", "HEAD"\]\)/);
  assert.match(build, /sourceSha256: sourceFingerprint\(root\)/);
  assert.match(vite, /__TAMKEEN_RELEASE__/);
  assert.match(release, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(release, /verifiable/);
});

test("full-admin diagnostics expose release identity without secrets", () => {
  assert.match(admin, /useRequireAdminSection\("full"\)/);
  assert.match(admin, /ReleaseDiagnostics release=\{release\}/);
  assert.match(diagnostics, /تشخيص الإصدار المنشور/);
  assert.match(diagnostics, /release\.id/);
  assert.doesNotMatch(admin + diagnostics, /SUPABASE_SERVICE_ROLE_KEY|password|secret/i);
});
