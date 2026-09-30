import { expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { teacherCsv, type TeacherRow } from "@/lib/admin-teachers";
import { canAccessAdminPath, filterAdminSidebarLinks } from "@/lib/admin-route-access";
it("does not grant the directory to students or content managers", () => {
  expect(canAccessAdminPath("/admin/teachers", { isAdmin: false, isContentStaff: false })).toBe(
    false,
  );
  expect(canAccessAdminPath("/admin/teachers", { isAdmin: false, isContentStaff: true })).toBe(
    false,
  );
  expect(canAccessAdminPath("/admin/teachers", { isAdmin: true, isContentStaff: true })).toBe(true);
  expect(filterAdminSidebarLinks([{ href: "/admin/teachers", label: "المعلمون" }], false)).toEqual(
    [],
  );
});
it("exports Arabic CSV without allowing teacher-entered formulas", () => {
  const row = {
    full_name: ' =HYPERLINK("https://example.test")',
    school_name: 'مدرسة، "تجريبية"',
    phone: "+967777123456",
    email: "@evil",
    status: "ACTIVE",
    school_district: "\t=1",
    best_score_percent: null,
  } as TeacherRow;
  const csv = teacherCsv([row]);
  expect(csv.startsWith("\ufeff")).toBe(true);
  expect(csv).toContain('"\' =HYPERLINK(""https://example.test"")"');
  expect(csv).toContain('"\'+967777123456"');
  expect(csv).toContain('"\'@evil"');
  expect(csv).toContain('"\'\t=1"');
  expect(csv).toContain('"مدرسة، ""تجريبية"""');
  expect(csv).not.toContain("undefined");
});
