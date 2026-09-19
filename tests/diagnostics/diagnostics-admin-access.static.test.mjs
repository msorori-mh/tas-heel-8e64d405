import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("diagnostics admin access guards", () => {
  const access = read("src/lib/admin-route-access.ts");
  const layout = read("src/components/admin/AdminLayout.tsx");
  const page = read("src/routes/_authenticated/admin.diagnostics.tsx");
  const fns = read("src/lib/diagnostics/diagnostics-admin.functions.ts");

  it("declares /admin/diagnostics as full-admin only", () => {
    const fullAdminBlock = access.slice(access.indexOf("FULL_ADMIN_ONLY_ADMIN_PATHS"));
    expect(fullAdminBlock.slice(0, fullAdminBlock.indexOf("] as const;"))).toContain(
      "/admin/diagnostics",
    );
    expect(access).toContain('if (path.startsWith("/admin/diagnostics")) return false;');
    const contentBlock = access.slice(
      access.indexOf("CONTENT_MANAGER_ADMIN_PATHS"),
      access.indexOf("FULL_ADMIN_ONLY_ADMIN_PATHS"),
    );
    expect(contentBlock).not.toContain("/admin/diagnostics");
  });

  it("hides the sidebar link from content managers", () => {
    expect(access).toContain('link.href !== "/admin/diagnostics"');
    expect(layout).toContain('href: "/admin/diagnostics"');
    expect(layout).toContain("صحة التطبيق والتشخيص");
  });

  it("guards the page with the full admin section hook", () => {
    expect(page).toContain('useRequireAdminSection("full")');
  });

  it("routes every admin read through authenticated server functions", () => {
    expect(fns).toContain("requireSupabaseAuth");
    expect(fns).not.toContain("client.server");
    for (const rpc of [
      "admin_diagnostics_summary",
      "admin_diagnostics_issues",
      "admin_diagnostics_issue_detail",
      "admin_diagnostics_set_issue_status",
    ]) {
      expect(fns).toContain(rpc);
    }
  });
});

describe("diagnostics telemetry privacy guards", () => {
  const telemetry = read("src/lib/diagnostics/telemetry.ts");

  it("never inserts without a session", () => {
    expect(telemetry).toContain("hasSession");
    expect(telemetry).toContain("queue(event)");
  });

  it("does not send user identity fields", () => {
    expect(telemetry).not.toMatch(/full_name|email|phone/);
    expect(telemetry).not.toContain("user_id:");
  });
});
