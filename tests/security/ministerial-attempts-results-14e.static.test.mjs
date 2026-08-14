import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const files = {
  api: "src/lib/ministerial/ministerial-student-api.ts",
  session: "src/routes/_authenticated/ministerial-exams.sessions.$sessionId.tsx",
  result: "src/routes/_authenticated/ministerial-exams.sessions.$sessionId.result.tsx",
  model: "src/routes/_authenticated/ministerial-exams.models.$modelId.tsx",
};

const read = (k) => readFileSync(files[k], "utf8");
const surfaces = Object.keys(files);

describe("PAST_MINISTERIAL_EXAMS_ATTEMPTS_RESULTS_14E — client safety", () => {
  it("grades, reveals and submits only through dedicated RPCs", () => {
    const api = read("api");
    expect(api).toContain('supabase.rpc("submit_ministerial_exam_session"');
    expect(api).toContain('supabase.rpc("reveal_ministerial_training_answer"');
    expect(api).toContain('supabase.rpc("get_ministerial_session_result"');
    expect(api).toContain('supabase.rpc("answer_ministerial_exam_question"');
    expect(api).not.toContain('supabase.rpc("submit_exam_session"');
  });

  it("never computes correctness or scores on the client", () => {
    for (const key of surfaces) {
      const src = read(key);
      expect(src).not.toContain("correct_index");
      expect(src).not.toContain("is_correct");
      expect(src).not.toContain("accepted_answers");
      expect(src).not.toContain('from("question_options")');
      expect(src).not.toContain('from("question_solutions")');
      expect(src).not.toContain('from("exam_session_answers")');
    }
  });

  it("answers are addressed by pinned option code, not by display position", () => {
    const api = read("api");
    expect(api).toContain("_option_code");
    expect(api).not.toContain("_selected_index");
  });

  it("submission is single-flighted and the timer is server-anchored", () => {
    const session = read("session");
    expect(session).toContain("createSingleFlightGuard");
    expect(session).toContain("server_now");
    expect(session).toContain("attempt_mode");
  });

  it("does not persist attempt data offline", () => {
    for (const key of surfaces) {
      const src = read(key);
      expect(src).not.toContain("localStorage");
      expect(src).not.toContain("indexedDB");
    }
  });
});
