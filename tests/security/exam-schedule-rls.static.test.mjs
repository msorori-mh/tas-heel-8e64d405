import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");
describe("exam schedule authorization", () => {
  it("adds exactly one empty, RLS-protected schedule migration", () => {
    const files = readdirSync("supabase/migrations").filter((p) =>
      p.endsWith("_exam_schedule_countdown.sql"),
    );
    expect(files).toHaveLength(1);
    const sql = read(`supabase/migrations/${files[0]}`).toLowerCase();
    expect(sql).toContain("enable row level security");
    expect(sql).toMatch(/for select to authenticated using \(is_published or public.has_role/);
    expect(sql).toMatch(
      /for all to authenticated[\s\S]*using \(public.has_role\(auth.uid\(\), 'admin'::app_role\)\)[\s\S]*with check \(public.has_role/,
    );
    expect(sql).not.toMatch(/insert\s+into\s+public.exam_schedule/);
    expect(sql).toContain("update_updated_at_column");
  });
  it("restricts the management page and navigation to full administrators", () => {
    const page = read("src/routes/_authenticated/admin.exam-schedule.tsx");
    expect(page).toContain('useRequireAdminSection("full")');
    expect(page).toContain("enabled: access.enabled");
    expect(page).toContain("!access.allowed");
    expect(page).toMatch(/\.delete\(\)\s*\.eq\("id",\s*deleteTarget.id\)/);
    expect(read("src/components/admin/AdminLayout.tsx")).toContain('href: "/admin/exam-schedule"');
    expect(read("src/lib/admin-route-access.ts")).toContain('link.href !== "/admin/exam-schedule"');
  });
});
