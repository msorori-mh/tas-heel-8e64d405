import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const vite = readFileSync("vite.config.ts", "utf8");
const release = readFileSync("src/lib/release-info.ts", "utf8");
const admin = readFileSync("src/routes/_authenticated/admin.index.tsx", "utf8");

test("the build embeds the exact Git SHA with a fail-closed fallback", () => {
  assert.match(vite, /GITHUB_SHA/);
  assert.match(vite, /git", \["rev-parse", "HEAD"\]/);
  assert.match(vite, /__TAMKEEN_RELEASE__/);
  assert.match(release, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(release, /verifiable/);
});

test("full-admin diagnostics expose release identity without secrets", () => {
  assert.match(admin, /useRequireAdminSection\("full"\)/);
  assert.match(admin, /تشخيص الإصدار المنشور/);
  assert.match(admin, /release\.shortSha/);
  assert.doesNotMatch(admin, /SUPABASE_SERVICE_ROLE_KEY|password|secret/i);
});
