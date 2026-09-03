import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = {
  migration: "supabase/migrations/20260825010000_ministerial_cross_track_mufadala_parity_14i.sql",
  listingMigration:
    "supabase/migrations/20260912040000_ministerial_track_first_student_listing.sql",
  api: "src/lib/ministerial/ministerial-student-api.ts",
  index: "src/routes/_authenticated/ministerial-exams.index.tsx",
  subject: "src/routes/_authenticated/ministerial-exams.$subjectId.tsx",
  model: "src/routes/_authenticated/ministerial-exams.models.$modelId.tsx",
  session: "src/routes/_authenticated/ministerial-exams.sessions.$sessionId.tsx",
  result: "src/routes/_authenticated/ministerial-exams.sessions.$sessionId.result.tsx",
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

  it("lists one explicit track only through the guarded read RPC", () => {
    const sql = read("listingMigration");
    assert.ok(sql.includes("list_ministerial_track_models"));
    assert.ok(sql.includes("_track_code IN ('sanaa', 'aden')"));
    assert.ok(sql.includes("ct.track_code = _track_code"));
    assert.ok(sql.includes("m.status = 'published'"));
    assert.ok(sql.includes("public.can_access_ministerial_model(m.id)"));
    assert.ok(sql.includes("ORDER BY m.academic_year DESC"));
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION"));
    assert.ok(sql.includes("FROM PUBLIC, anon"));
    assert.ok(sql.includes("TO authenticated"));
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

  it("preserves model track identity and requires a durable Sanaa-or-Aden choice", () => {
    const api = read("api");
    const index = read("index");
    const subject = read("subject");
    const model = read("model");
    const session = read("session");
    const result = read("result");
    assert.ok(api.includes('track_code: "sanaa" | "aden"'));
    assert.ok(api.includes("track_name: string"));
    assert.ok(api.includes('supabase.rpc("list_ministerial_track_models"'));
    assert.ok(index.includes("subject.sanaa_models_count"));
    assert.ok(index.includes("subject.aden_models_count"));
    assert.ok(index.includes("اختر منهج الاختبارات"));
    assert.ok(index.includes("search={{ track: option.code }}"));
    assert.ok(index.includes("لن تختلط النماذج"));
    assert.ok(index.includes("right.academic_year - left.academic_year"));
    assert.ok(index.includes("نماذج عام {year}"));
    assert.ok(index.includes("model.subject_name"));
    assert.ok(!index.includes("اختر المادة"));
    assert.ok(index.includes("محاولاتك ونتائجك"));
    assert.ok(index.includes("إعادة المحاولة"));
    assert.ok(subject.includes('type MinisterialTrack = "sanaa" | "aden"'));
    assert.ok(subject.includes("validateSearch: zodValidator(searchSchema)"));
    assert.ok(subject.includes('z.enum(["sanaa", "aden"])'));
    assert.ok(subject.includes("اختر منهج الاختبار"));
    assert.ok(subject.includes("منهج صنعاء"));
    assert.ok(subject.includes("منهج عدن"));
    assert.ok(subject.includes("model.track_code === selectedTrack"));
    assert.ok(subject.includes("right.academic_year - left.academic_year"));
    assert.ok(subject.includes("نماذج عام {year}"));
    assert.ok(!index.includes("كل النماذج"));
    assert.ok(!subject.includes("كل النماذج"));
    assert.ok(!subject.includes('TrackFilter = "all"'));
    assert.ok(model.includes("search={{ track: data.track_code }}"));
    assert.ok(session.includes("data.model.track_code"));
    assert.ok(result.includes("data.model.track_code"));
    assert.ok(!result.includes("كل النماذج الوزارية"));
  });

  it("keeps strict simulation server-timed when an imported duration is absent", () => {
    const sql = read("migration");
    assert.ok(sql.includes("IF v_mode = 'strict' THEN"));
    assert.ok(sql.includes("COALESCE(v_tpl.duration_seconds, GREATEST(5, v_total_q) * 60)"));
  });
});
