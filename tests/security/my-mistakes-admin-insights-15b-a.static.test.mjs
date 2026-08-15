import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const files = {
  api: "src/lib/mistakes/admin-mistake-insights-api.ts",
  page: "src/routes/_authenticated/admin.learning-insights.mistakes.tsx",
  access: "src/lib/admin-route-access.ts",
  sql: "supabase/migrations-pending/20260817010000_my_mistakes_derived_model_15b.sql",
};
const read = (k) => readFileSync(files[k], "utf8");
const clientSurfaces = ["api", "page"];

describe("15B_A — ANSWER_LEAK = ZERO on the admin surface", () => {
  it("no answer-key vocabulary in the admin client contract", () => {
    for (const key of clientSurfaces) {
      const src = read(key);
      for (const bad of [
        "correct_option_code",
        "answer_key",
        "accepted_answers",
        "model_answer",
        "is_correct",
        "hidden_solution",
      ]) {
        expect(src).not.toContain(bad);
      }
    }
  });
});

describe("15B_A — PRIVACY: aggregate only", () => {
  it("admin client never surfaces student identities", () => {
    for (const key of clientSurfaces) {
      const src = read(key);
      for (const bad of ["user_id", "student_id", "full_name", "phone", "email"]) {
        expect(src).not.toContain(bad);
      }
    }
  });

  it("admin RPC payload contains no identity keys", () => {
    const sql = read("sql");
    const fn = sql.slice(sql.indexOf("get_admin_mistake_insights"));
    expect(fn).not.toMatch(/'user_id'/);
    expect(fn).not.toMatch(/'student_id'/);
    expect(fn).not.toMatch(/'full_name'/);
  });
});

describe("15B_A — SAME SOURCE OF TRUTH / NO NEW TABLES", () => {
  it("migration creates no mistake table", () => {
    const sql = read("sql");
    expect(sql).not.toMatch(/CREATE\s+TABLE/i);
    expect(sql).not.toMatch(/CREATE\s+MATERIALIZED\s+VIEW/i);
  });

  it("admin insights derive from the existing attempt tables", () => {
    const sql = read("sql");
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.get_admin_mistake_insights"));
    expect(fn).toContain("public.exam_sessions");
    expect(fn).toContain("public.exam_session_questions");
    expect(fn).toContain("public.exam_session_answers");
  });
});

describe("15B_A — ADMIN AUTHZ", () => {
  it("RPC is SECURITY DEFINER, admin-gated and not granted to anon", () => {
    const sql = read("sql");
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.get_admin_mistake_insights"));
    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toMatch(/is_full_admin|has_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_admin_mistake_insights[\s\S]*FROM anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_admin_mistake_insights[\s\S]*TO authenticated/);
  });

  it("admin page is gated to full admins and hidden from content managers", () => {
    const page = read("page");
    expect(page).toContain('useRequireAdminSection("full")');
    const access = read("access");
    expect(access).toContain('if (path.startsWith("/admin/learning-insights")) return false;');
    expect(access).toContain('link.href !== "/admin/learning-insights/mistakes"');
  });

  it("admin client calls only the aggregate RPC", () => {
    const api = read("api");
    expect(api).toContain('rpc("get_admin_mistake_insights"');
    for (const t of [
      "exam_session_answers",
      "exam_session_questions",
      "exam_sessions",
      "question_revisions",
      "question_options",
    ]) {
      expect(api).not.toContain(`from("${t}")`);
    }
  });
});
