/**
 * TAMKEEN_UNIFIED_PERFORMANCE_DUAL_SURFACE_15C — static guard tests.
 * No DB access: migration-source and client-source guarantees only.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PENDING = resolve(
  ROOT,
  "supabase/migrations-pending/20260818010000_unified_performance_dual_surface_15c.sql",
);
const APPLIED = resolve(
  ROOT,
  "supabase/migrations/20260818010000_unified_performance_dual_surface_15c.sql",
);
const MIGRATION = readFileSync(existsSync(PENDING) ? PENDING : APPLIED, "utf8");
const API = readFileSync(resolve(ROOT, "src/lib/performance/unified-performance-api.ts"), "utf8");
const STUDENT_PAGE = readFileSync(
  resolve(ROOT, "src/routes/_authenticated/performance.tsx"),
  "utf8",
);
const ADMIN_PAGE = readFileSync(
  resolve(ROOT, "src/routes/_authenticated/admin.learning-insights.performance.tsx"),
  "utf8",
);

describe("15C migration shape", () => {
  it("creates NO new analytics table or materialized view", () => {
    expect(/create\s+table/i.test(MIGRATION)).toBe(false);
    expect(/create\s+materialized\s+view/i.test(MIGRATION)).toBe(false);
  });

  it("exposes exactly the two dual-surface RPCs", () => {
    expect(MIGRATION).toContain("public.get_student_unified_performance");
    expect(MIGRATION).toContain("public.get_admin_unified_performance");
  });

  it("grants execute to authenticated only (never anon/public)", () => {
    const grants = MIGRATION.match(/GRANT EXECUTE[^;]+;/gi) ?? [];
    expect(grants.length).toBeGreaterThanOrEqual(2);
    for (const g of grants) {
      expect(/to\s+authenticated/i.test(g)).toBe(true);
      expect(/to\s+(anon|public)\b/i.test(g)).toBe(false);
    }
    expect(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/i.test(MIGRATION)).toBe(true);
  });

  it("student RPC never accepts a target user id", () => {
    const studentSig = MIGRATION.slice(
      MIGRATION.indexOf("FUNCTION public.get_student_unified_performance"),
    ).slice(0, 400);
    expect(/_user_id/.test(studentSig)).toBe(false);
    expect(MIGRATION).toContain("auth.uid()");
  });

  it("internal helpers stay private to the definer chain", () => {
    for (const helper of ["_up_sessions", "_up_occurrences", "_up_progress"]) {
      expect(MIGRATION).toContain(`public.${helper}`);
      expect(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${helper}`, "i").test(MIGRATION)).toBe(
        false,
      );
    }
  });
});

describe("15C answer-leak zero", () => {
  const leaky = [
    "is_correct",
    "correct_option",
    "answer_key",
    "option_text",
    "accepted_answer",
    "solution_text",
  ];

  it("client payload types never carry an answer key", () => {
    for (const key of leaky) {
      expect(API.includes(key)).toBe(false);
      expect(STUDENT_PAGE.includes(key)).toBe(false);
      expect(ADMIN_PAGE.includes(key)).toBe(false);
    }
  });

  it("client never reads answer-bearing tables directly", () => {
    for (const src of [API, STUDENT_PAGE, ADMIN_PAGE]) {
      for (const table of [
        "exam_session_answers",
        "question_options",
        "question_accepted_answers",
        "question_solutions",
        "question_revisions",
        "question_targets",
      ]) {
        expect(src.includes(`from("${table}")`)).toBe(false);
      }
    }
  });
});

describe("15C single source of truth", () => {
  it("client computes no metric — it only formats", () => {
    expect(/avg_percentage\s*=\s*\(/.test(API)).toBe(false);
    expect(API).toContain("get_student_unified_performance");
    expect(API).toContain("get_admin_unified_performance");
  });

  it("admin surface documents the privacy threshold", () => {
    expect(MIGRATION).toContain("privacy_min_group_size");
    expect(ADMIN_PAGE).toContain("privacy_min_group_size");
  });

  it("both surfaces share the same attempt-type vocabulary", () => {
    for (const t of [
      "ORDINARY",
      "MINISTERIAL",
      "MINISTERIAL_TRAINING",
      "MINISTERIAL_STRICT",
    ]) {
      expect(API).toContain(t);
      expect(MIGRATION).toContain(t);
    }
  });
});
