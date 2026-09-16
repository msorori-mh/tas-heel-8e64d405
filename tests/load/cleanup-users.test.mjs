import test from "node:test";
import assert from "node:assert/strict";
import { cleanupSql } from "../../scripts/load-test/cleanup-users.mjs";
import { STAGING } from "../../scripts/load-test/student-journey.mjs";
const manifest = {
  project: STAGING,
  run: "captest2026",
  expectedCount: 1,
  users: [{ id: "00000000-0000-4000-8000-000000000001", email: "captest2026.1@load.test.invalid" }],
};
test("cleanup rejects unrelated identities, changed counts and SQL injection", () => {
  assert.throws(() => cleanupSql({ ...manifest, project: "production" }), /STAGING/);
  assert.throws(() => cleanupSql({ ...manifest, expectedCount: 2 }), /COUNT/);
  assert.throws(() => cleanupSql({ ...manifest, run: "x'; DELETE FROM auth.users;--" }), /STAGING/);
  for (const email of [
    "real@example.com",
    "other2026.1@load.test.invalid",
    "captest2026.1@load.test.invalid' OR true--",
  ])
    assert.throws(
      () => cleanupSql({ ...manifest, users: [{ ...manifest.users[0], email }] }),
      /IDENTITY/,
    );
  assert.throws(
    () =>
      cleanupSql({ ...manifest, expectedCount: 2, users: [manifest.users[0], manifest.users[0]] }),
    /IDENTITY/,
  );
  assert.match(cleanupSql(manifest), /RETAINED_USER_CHANGED/);
});
