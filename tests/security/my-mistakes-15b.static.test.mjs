import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const files = {
  api: "src/lib/mistakes/my-mistakes-api.ts",
  card: "src/components/mistakes/MistakeCard.tsx",
  page: "src/routes/_authenticated/my-mistakes.tsx",
  sql: "supabase/migrations/20260817010000_my_mistakes_derived_model_15b.sql",
};

const read = (k) => readFileSync(files[k], "utf8");
const clientSurfaces = ["api", "card", "page"];

describe("15B — ANSWER_LEAK = ZERO", () => {
  it("no answer-key vocabulary in the client contract", () => {
    for (const key of clientSurfaces) {
      const src = read(key);
      expect(src).not.toContain("correct_option_code");
      expect(src).not.toContain("correct_index");
      expect(src).not.toContain("answer_key");
      expect(src).not.toContain("accepted_answers");
      expect(src).not.toContain("model_answer");
      expect(src).not.toContain("is_correct");
      expect(src).not.toContain("hidden_solution");
    }
  });

  it("the SQL never projects correctness or answer keys into a payload", () => {
    const sql = read("sql");
    expect(sql).not.toMatch(/'is_correct'/);
    expect(sql).not.toMatch(/'correct_option_code'/);
    expect(sql).not.toMatch(/question_accepted_answers/);
    expect(sql).not.toMatch(/question_solutions/);
    expect(sql).not.toMatch(/question_solution_steps/);
  });
});

describe("15B — NO_DIRECT_SENSITIVE_SELECT", () => {
  it("client never reads sensitive tables directly", () => {
    for (const key of clientSurfaces) {
      const src = read(key);
      for (const t of [
        "question_revisions",
        "question_targets",
        "question_options",
        "ministerial_exam_questions",
        "exam_session_answers",
        "exam_session_questions",
        "exam_sessions",
      ]) {
        expect(src).not.toContain(`from("${t}")`);
      }
    }
  });

  it("client reads the notebook only through the two dedicated RPCs", () => {
    const api = read("api");
    expect(api).toContain('rpc("list_my_mistakes"');
    expect(api).toContain('rpc("get_my_mistake_detail"');
  });

  it("the migration grants no new direct table privileges", () => {
    const sql = read("sql");
    expect(sql).not.toMatch(/GRANT\s+SELECT\s+ON\s+(TABLE\s+)?public\./i);
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
    expect(sql).not.toMatch(/CREATE\s+TABLE/i);
  });
});

describe("15B — NO_CLIENT_GRADING", () => {
  it("no grading or scoring logic on the client", () => {
    for (const key of clientSurfaces) {
      const src = read(key);
      expect(src).not.toMatch(/final_score/);
      expect(src).not.toMatch(/max_score/);
      expect(src).not.toMatch(/=== *['"]?correct/i);
    }
  });
});

describe("15B — NO_USER_ID_PARAMETER", () => {
  it("client never sends a user id to the RPCs", () => {
    for (const key of clientSurfaces) {
      expect(read(key)).not.toContain("_user_id");
    }
  });

  it("the RPC signatures accept no user id and resolve auth.uid() internally", () => {
    const sql = read("sql");
    expect(sql).not.toMatch(/_user_id\s+uuid/);
    expect((sql.match(/auth\.uid\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sql.match(/RAISE EXCEPTION 'unauthorized'/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("15B — ANON_EXECUTE_ZERO", () => {
  const sql = read("sql");

  it("every function is hardened SECURITY DEFINER with a pinned search_path", () => {
    const defs = (sql.match(/SECURITY DEFINER/g) ?? []).length;
    expect(defs).toBeGreaterThanOrEqual(2);
    expect((sql.match(/SET search_path = public, pg_temp/g) ?? []).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("revokes PUBLIC/anon and grants execute to authenticated only", () => {
    expect(
      (sql.match(/REVOKE ALL ON FUNCTION[^;]*FROM PUBLIC/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      (sql.match(/REVOKE ALL ON FUNCTION[^;]*FROM anon/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      (sql.match(/GRANT EXECUTE ON FUNCTION[^;]*TO authenticated/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION[^;]*TO anon/);
  });
});

describe("15B — historical + isolation guards", () => {
  const sql = read("sql");

  it("attributes occurrences through the pinned revision, not the latest one", () => {
    expect(sql).toContain("t.revision_id = o.question_revision_id");
    expect(sql).not.toMatch(/current_published_revision_id/);
  });

  it("keeps ministerial track isolation", () => {
    expect(sql).toContain("current_student_track_id()");
    expect((sql.match(/m\.curriculum_track_id = v_track/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("paginates server-side with an explicit total", () => {
    expect(sql).toContain("LIMIT v_limit OFFSET v_offset");
    expect(sql).toContain("'has_more'");
    expect(sql).toContain("'total'");
  });
});
