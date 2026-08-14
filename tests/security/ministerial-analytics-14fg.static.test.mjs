import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const files = {
  api: "src/lib/ministerial/ministerial-analytics-api.ts",
  performance: "src/routes/_authenticated/ministerial-exams.performance.tsx",
  repeatedIndex: "src/routes/_authenticated/ministerial-exams.repeated.index.tsx",
  repeatedSubject: "src/routes/_authenticated/ministerial-exams.repeated.$subjectId.tsx",
  sql: "supabase/migrations/20260815020000_ministerial_analytics_14f_14g.sql",
};

const read = (k) => readFileSync(files[k], "utf8");
const clientSurfaces = ["api", "performance", "repeatedIndex", "repeatedSubject"];

describe("14F/14G — client safety", () => {
  it("reads analytics only through the dedicated RPCs", () => {
    const api = read("api");
    expect(api).toContain('rpc("get_ministerial_performance_overview"');
    expect(api).toContain('rpc("list_repeated_ministerial_questions"');
    expect(api).toContain('rpc("list_repeated_ministerial_subjects"');
  });

  it("never selects sensitive membership or answer tables directly", () => {
    for (const key of clientSurfaces) {
      const src = read(key);
      expect(src).not.toContain('from("ministerial_exam_questions")');
      expect(src).not.toContain('from("question_revisions")');
      expect(src).not.toContain('from("question_options")');
      expect(src).not.toContain('from("question_solutions")');
      expect(src).not.toContain('from("exam_session_answers")');
      expect(src).not.toContain('from("exam_sessions")');
    }
  });

  it("carries no answer key vocabulary in the analytics payload contract", () => {
    for (const key of clientSurfaces) {
      const src = read(key);
      expect(src).not.toContain("correct_option_code");
      expect(src).not.toContain("answer_key");
      expect(src).not.toContain("accepted_answers");
      expect(src).not.toContain("model_answer");
    }
  });

  it("never passes a user_id to an analytics RPC", () => {
    for (const key of clientSurfaces) {
      expect(read(key)).not.toContain("_user_id");
    }
  });
});

describe("14F/14G — SQL guards", () => {
  const sql = read("sql");

  it("all functions are hardened SECURITY DEFINER with authenticated-only execute", () => {
    expect(sql).toContain("SET search_path = public, pg_temp");
    expect((sql.match(/REVOKE ALL ON FUNCTION/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(sql).toContain("FROM anon");
    expect((sql.match(/GRANT EXECUTE ON FUNCTION/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION[^;]*TO anon/);
  });

  it("requires an authenticated caller and never accepts a user_id argument", () => {
    expect((sql.match(/v_uid uuid := auth\.uid\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((sql.match(/IF v_uid IS NULL THEN\s*\n\s*RAISE EXCEPTION 'unauthorized';/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(sql).not.toMatch(/_user_id\s+uuid/);
  });

  it("scopes every ministerial read by the student's curriculum track", () => {
    expect((sql.match(/curriculum_track_id = v_track/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("public.can_access_subject(");
  });

  it("final score metrics use graded final sessions and percentages", () => {
    expect(sql).toContain("is_final = true AND grading_status = 'GRADED'");
    expect(sql).toContain("status IN ('submitted', 'expired')");
    expect(sql).toContain("avg_percentage");
    expect(sql).toContain("best_percentage");
    expect(sql).toContain("improvement_percentage_points");
    expect(sql).toContain("pending_manual_count");
  });

  it("lesson attribution uses the historical pinned revision target", () => {
    expect(sql).toContain("t.revision_id = a.question_revision_id");
    expect(sql).toContain("unlinked_questions_count");
    expect(sql).toContain("manual_pending");
  });

  it("repeated identity is the canonical question_id counted by distinct model", () => {
    expect(sql).toMatch(/GROUP BY (m\.subject_id, )?meq\.question_id/);
    expect(sql).toContain("count(DISTINCT model_id)");
    expect(sql).toContain("display_revision_id");
    expect(sql).toContain("published_revision_id");
  });

  it("exposes no answer key from SQL", () => {
    expect(sql).not.toContain("question_options");
    expect(sql).not.toContain("question_solutions");
    expect(sql).not.toContain("accepted_answers");
    expect(sql).not.toContain("is_correct'");
  });
});
