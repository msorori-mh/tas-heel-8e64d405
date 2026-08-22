import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const files = {
  migration:
    "supabase/migrations/20260825010000_ministerial_cross_track_mufadala_parity_14i.sql",
  api: "src/lib/ministerial/ministerial-student-api.ts",
  index: "src/routes/_authenticated/ministerial-exams.index.tsx",
  subject: "src/routes/_authenticated/ministerial-exams.$subjectId.tsx",
};

const read = (key) => readFileSync(files[key], "utf8");

describe("PAST_MINISTERIAL_EXAMS_CROSS_TRACK_MUFADALA_PARITY_14I", () => {
  it("allows only the operational Sanaa and Aden tracks for cross-track practice", () => {
    const sql = read("migration");
    expect(sql).toContain("can_access_ministerial_model");
    expect(sql).toContain("track_code IN ('sanaa', 'aden')");
    expect(sql).toContain("p.grade_uuid = s.grade_id OR p.grade_id = s.grade_id::text");
    expect(sql).not.toContain("track_code IN ('sanaa', 'aden', 'other')");
  });

  it("keeps published, grade and active subject-track gates on every model", () => {
    const sql = read("migration");
    expect(sql).toContain("status = 'published'");
    expect(sql).toContain("sct.is_active IS TRUE");
    expect(sql).toContain("student_track.is_active IS TRUE");
    expect(sql).toContain("public.can_access_ministerial_model(m.id)");
  });

  it("creates sessions through the secure revision-pinned server path", () => {
    const sql = read("migration");
    const api = read("api");
    expect(api).toContain('supabase.rpc("create_ministerial_exam_session"');
    expect(sql).toContain("'REVISION_PINNED'");
    expect(sql).toContain("correct_answers, is_final");
    expect(sql).toContain("NULL, false");
    expect(api).not.toContain('from("ministerial_exam_questions")');
    expect(api).not.toContain('from("question_options")');
  });

  it("preserves model track identity and exposes an all/Sanaa/Aden filter", () => {
    const api = read("api");
    const index = read("index");
    const subject = read("subject");
    expect(api).toContain('track_code: "sanaa" | "aden"');
    expect(api).toContain("track_name: string");
    expect(index).toContain("s.sanaa_models_count");
    expect(index).toContain("s.aden_models_count");
    expect(subject).toContain('type TrackFilter = "all" | "sanaa" | "aden"');
    expect(subject).toContain("m.track_name");
  });

  it("keeps strict simulation server-timed even when an imported duration is absent", () => {
    const sql = read("migration");
    expect(sql).toContain("IF v_mode = 'strict' THEN");
    expect(sql).toContain("COALESCE(v_tpl.duration_seconds, GREATEST(5, v_total_q) * 60)");
  });
});
