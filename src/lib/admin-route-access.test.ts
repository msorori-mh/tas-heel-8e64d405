import assert from "node:assert/strict";
import test from "node:test";
import { canAccessAdminPath, filterAdminSidebarLinks } from "./admin-route-policy.ts";

test("reports remain full-admin-only", () => {
  assert.equal(canAccessAdminPath("/admin/reports", { isAdmin: true, isContentStaff: true }), true);
  assert.equal(
    canAccessAdminPath("/admin/reports", { isAdmin: false, isContentStaff: true }),
    false,
  );
  assert.equal(
    canAccessAdminPath("/admin/reports", { isAdmin: false, isContentStaff: false }),
    false,
  );
});

test("content managers retain content-only paths", () => {
  assert.equal(
    canAccessAdminPath("/admin/subjects", { isAdmin: false, isContentStaff: true }),
    true,
  );
  assert.equal(
    canAccessAdminPath("/admin/lessons/example", { isAdmin: false, isContentStaff: true }),
    true,
  );
});

test("content-manager navigation never includes reports", () => {
  const links = [
    { href: "/admin/reports" as const, label: "التقارير" },
    { href: "/admin/subjects" as const, label: "المواد" },
  ];

  assert.deepEqual(filterAdminSidebarLinks(links, false), [links[1]]);
  assert.deepEqual(filterAdminSidebarLinks(links, true), links);
});
