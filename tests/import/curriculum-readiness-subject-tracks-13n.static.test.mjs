import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const subjects = read("src/routes/_authenticated/admin.subjects.tsx");
const curriculum = read("src/routes/_authenticated/admin.curriculum.tsx");
const dialog = read("src/components/admin/SubjectEditDialog.tsx");
const functions = read("src/lib/content-codes/content-codes.functions.ts");
const questions = read("src/routes/_authenticated/admin.questions.tsx");
const templates = read("src/routes/_authenticated/admin.exam-templates.tsx");
const migration = read(
  "supabase/migrations/20260829010000_curriculum_readiness_subject_tracks_13n.sql",
);

test("subjects page uses the many-track truth and actual unit/lesson rows", () => {
  assert.match(subjects, /subject_curriculum_tracks/);
  assert.match(subjects, /track_code", \["sanaa", "aden"\]/);
  assert.match(subjects, /from\("units"\)/);
  assert.match(subjects, /from\("lessons"\)/);
  assert.doesNotMatch(subjects, /lessons_count/);
  assert.doesNotMatch(subjects, /curriculum_track_id, icon/);
  assert.doesNotMatch(subjects, /CurriculumDeleteDialog|Trash2/);
});

test("curriculum page is a non-destructive readiness view", () => {
  assert.match(curriculum, /استعراض الجاهزية والعلاقات الفعلية فقط/);
  assert.match(curriculum, /subject_curriculum_tracks/);
  assert.match(curriculum, /الدروس مرتبطة بالمادة مباشرة/);
  assert.doesNotMatch(curriculum, /CurriculumDeleteDialog|Trash2|onDelete/);
  assert.doesNotMatch(curriculum, /group_code|المجموعة/);
});

test("subject intake is system coded and supports Sanaa plus Aden", () => {
  assert.match(dialog, /type="checkbox"/);
  assert.match(dialog, /اختيار متعدد/);
  assert.match(dialog, /خيار «آخر» غير مستخدم/);
  assert.doesNotMatch(dialog, /onChange=\{\(e\) => setSubjectCode/);
  assert.match(functions, /saveCurriculumSubjectAdmin/);
  assert.match(functions, /admin_save_curriculum_subject/);
  assert.match(migration, /track_code in \('sanaa', 'aden'\)/);
  assert.match(migration, /'sub-' \|\| v_grade_short/);
  assert.match(migration, /SUBJECT_TRACK_DETACH_REQUIRES_IMPACT_REVIEW/);
  assert.match(migration, /is_content_staff/);
});

test("questions and custom templates have explicit, separated purposes", () => {
  assert.match(questions, /مراجعة أسئلة الدروس/);
  assert.match(questions, /أسئلة الكتاب الرسمية/);
  assert.match(questions, /اختبر نفسك/);
  assert.doesNotMatch(questions, /select\([^)]*correct_index/);
  assert.match(templates, /قوالب اختبارات مخصصة/);
  assert.match(templates, /ليست من محتويات الدرس السبعة/);
  assert.match(templates, /النماذج الوزارية/);
});
