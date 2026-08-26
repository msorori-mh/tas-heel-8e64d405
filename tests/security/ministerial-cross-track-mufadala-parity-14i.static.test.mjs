import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = {
  migration: "supabase/migrations/20260825010000_ministerial_cross_track_mufadala_parity_14i.sql",
  api: "src/lib/ministerial/ministerial-student-api.ts",
  index: "src/routes/_authenticated/ministerial-exams.index.tsx",
  subject: "src/routes/_authenticated/ministerial-exams.$subjectId.tsx",
};

const read = (key) => readFileSync(files[key], "utf8");

describe("PAST_MINISTERIAL_EXAMS_CROSS_TRACK_MUFADALA_PARITY_14I", () => {
  it("allows only the operational Sanaa and Aden tracks for cross-track practice", () => {
    const sql = read("migration");
    assert.ok(sql.includes("can_access_ministerial_model"));
    assert.ok(sql.includes("track_code IN ('sanaa', 'aden')"));
    assert.ok(sql.includes("p.grade_uuid = s.grade_id OR p.grade_id = s.grade_id::text"));
    assert.ok(!sql.includes("track_code IN ('sanaa', 'aden', 'other')"));
  });

  it("keeps published, grade and active subject-track gates on every model", () => {
    const sql = read("migration");
    assert.ok(sql.includes("status = 'published'"));
    assert.ok(sql.includes("sct.is_active IS TRUE"));
    assert.ok(sql.includes("student_track.is_active IS TRUE"));
    assert.ok(sql.includes("public.can_access_ministerial_model(m.id)"));
  });

  it("creates sessions through the secure revision-pinned server path", () => {
    const sql = read("migration");
    const api = read("api");
    assert.ok(api.includes('supabase.rpc("create_ministerial_exam_session"'));
    assert.ok(sql.includes("'REVISION_PINNED'"));
    assert.ok(sql.includes("correct_answers, is_final"));
    assert.ok(sql.includes("NULL, false"));
    assert.ok(!api.includes('from("ministerial_exam_questions")'));
    assert.ok(!api.includes('from("question_options")'));
  });

  it("preserves model track identity and exposes an all/Sanaa/Aden filter", () => {
    const api = read("api");
    const index = read("index");
    const subject = read("subject");
    assert.ok(api.includes('track_code: "sanaa" | "aden"'));
    assert.ok(api.includes("track_name: string"));
    assert.ok(index.includes("s.sanaa_models_count"));
    assert.ok(index.includes("s.aden_models_count"));
    assert.ok(subject.includes('type TrackFilter = "all" | "sanaa" | "aden"'));
    assert.ok(subject.includes("m.track_name"));
  });

  it("keeps strict simulation server-timed when an imported duration is absent", () => {
    const sql = read("migration");
    assert.ok(sql.includes("IF v_mode = 'strict' THEN"));
    assert.ok(sql.includes("COALESCE(v_tpl.duration_seconds, GREATEST(5, v_total_q) * 60)"));
  });
});
