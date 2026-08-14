import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const files = {
  api: "src/lib/ministerial/ministerial-student-api.ts",
  list: "src/routes/_authenticated/ministerial-exams.index.tsx",
  subject: "src/routes/_authenticated/ministerial-exams.$subjectId.tsx",
  model: "src/routes/_authenticated/ministerial-exams.models.$modelId.tsx",
  session: "src/routes/_authenticated/ministerial-exams.sessions.$sessionId.tsx",
  entry: "src/components/home/MinisterialExamsEntry.tsx",
};

const read = (k) => readFileSync(files[k], "utf8");
const studentSurfaces = ["api", "list", "subject", "model", "session"];

describe("PAST_MINISTERIAL_EXAMS_STUDENT_EXPERIENCE_14D — client safety", () => {
  it("never selects ministerial membership or revision tables from the client", () => {
    for (const key of studentSurfaces) {
      const src = read(key);
      expect(src).not.toContain('from("ministerial_exam_questions")');
      expect(src).not.toContain('from("question_revisions")');
      expect(src).not.toContain('from("question_options")');
      expect(src).not.toContain('from("question_solutions")');
      expect(src).not.toContain('from("exam_session_questions")');
      expect(src).not.toContain('from("ministerial_exam_models")');
    }
  });

  it("never references correct answers or solutions on the client", () => {
    for (const key of studentSurfaces) {
      const src = read(key);
      expect(src).not.toContain("correct_index");
      expect(src).not.toContain("is_correct");
      expect(src).not.toContain("accepted_answers");
    }
  });

  it("creates ministerial sessions only through the dedicated RPC", () => {
    const api = read("api");
    expect(api).toContain('supabase.rpc("create_ministerial_exam_session"');
    expect(api).not.toContain("create_exam_session_with_snapshot");
    for (const key of studentSurfaces) {
      expect(read(key)).not.toContain("create_exam_session_with_snapshot");
    }
  });

  it("reads session questions only via the snapshot RPC", () => {
    expect(read("api")).toContain('supabase.rpc("get_ministerial_session_state"');
    expect(read("session")).toContain("fetchMinisterialSessionState");
  });

  it("does not persist ministerial exam content offline", () => {
    for (const key of studentSurfaces) {
      const src = read(key);
      expect(src).not.toContain("localStorage");
      expect(src).not.toContain("indexedDB");
    }
  });

  it("gates the home entry point to third secondary", () => {
    const entry = read("entry");
    expect(entry).toContain("grade-12");
    expect(entry).toContain("return null");
  });
});
