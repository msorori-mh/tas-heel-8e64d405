/**
 * Production lesson lookup contract test.
 *
 * Verifies that HTML import resolves lessons through the authoritative scope:
 *   grade_code → grades.slug
 *   subject_code → subjects.slug (scoped by grade)
 *   lesson_code → lessons.slug (scoped by subject)
 *
 * Fail-closed behavior:
 *   - missing grade/subject/lesson → DENY with clear error
 *   - same slug in different subjects → correct isolation
 *   - ambiguous result (>1 match) → DENY
 *
 * Uses real Local Supabase/PostgreSQL only.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server.ts";
import { createHtmlWorkflowAdapter } from "../../src/lib/server/html-pipeline/html-workflow-adapter.ts";
import { runSql } from "./html-operational-e2e-helpers.mjs";

const TEST_PREFIX = "TEST_ONLY_TAMKEEN_LOOKUP";
const GRADE_SLUG = `${TEST_PREFIX}-grade`;
const SUBJECT_A_SLUG = `${TEST_PREFIX}-subject-a`;
const SUBJECT_B_SLUG = `${TEST_PREFIX}-subject-b`;
const LESSON_SLUG = `${TEST_PREFIX}-lesson`;

const ids = {
  grade: null,
  subjectA: null,
  subjectB: null,
  lessonA: null,
  lessonB: null,
};

async function cleanup() {
  if (ids.lessonA) await supabaseAdmin.from("lessons").delete().eq("id", ids.lessonA);
  if (ids.lessonB) await supabaseAdmin.from("lessons").delete().eq("id", ids.lessonB);
  if (ids.subjectA) await supabaseAdmin.from("subjects").delete().eq("id", ids.subjectA);
  if (ids.subjectB) await supabaseAdmin.from("subjects").delete().eq("id", ids.subjectB);
  if (ids.grade) await supabaseAdmin.from("grades").delete().eq("id", ids.grade);
}

describe("HTML lesson lookup production contract", () => {
  before(async () => {
    await cleanup();

    const { data: grade, error: gradeErr } = await supabaseAdmin
      .from("grades")
      .insert({ slug: GRADE_SLUG, name: `${TEST_PREFIX} Grade`, category: "test", sort_order: 99999 })
      .select("id")
      .single();
    assert.ifError(gradeErr);
    ids.grade = grade.id;

    const [{ data: subjectA }, { data: subjectB }] = await Promise.all([
      supabaseAdmin
        .from("subjects")
        .insert({ grade_id: ids.grade, slug: SUBJECT_A_SLUG, name: `${TEST_PREFIX} Subject A`, sort_order: 99999 })
        .select("id")
        .single(),
      supabaseAdmin
        .from("subjects")
        .insert({ grade_id: ids.grade, slug: SUBJECT_B_SLUG, name: `${TEST_PREFIX} Subject B`, sort_order: 99998 })
        .select("id")
        .single(),
    ]);
    ids.subjectA = subjectA.id;
    ids.subjectB = subjectB.id;

    const [{ data: lessonA }, { data: lessonB }] = await Promise.all([
      supabaseAdmin
        .from("lessons")
        .insert({ subject_id: ids.subjectA, slug: LESSON_SLUG, title: `${TEST_PREFIX} Lesson A`, sort_order: 99999 })
        .select("id")
        .single(),
      supabaseAdmin
        .from("lessons")
        .insert({ subject_id: ids.subjectB, slug: LESSON_SLUG, title: `${TEST_PREFIX} Lesson B`, sort_order: 99998 })
        .select("id")
        .single(),
    ]);
    ids.lessonA = lessonA.id;
    ids.lessonB = lessonB.id;
  });

  after(async () => {
    await cleanup();
  });

  it("looks up the correct lesson when scoped to subject A", async () => {
    const workflow = createHtmlWorkflowAdapter(supabaseAdmin);
    const map = await workflow.lookupLessonsByCode([
      { grade_code: GRADE_SLUG, subject_code: SUBJECT_A_SLUG, lesson_code: LESSON_SLUG },
    ]);
    const key = `${GRADE_SLUG}|${SUBJECT_A_SLUG}|${LESSON_SLUG}`;
    assert.ok(map.has(key), "lookup must return scoped lesson");
    assert.equal(map.get(key).id, ids.lessonA, "must resolve to subject A's lesson");
    assert.equal(map.get(key).subject_id, ids.subjectA, "subject_id must match subject A");
    assert.equal(map.get(key).grade_id, ids.grade, "grade_id must be derived from resolved subject");
  });

  it("looks up the correct lesson when scoped to subject B", async () => {
    const workflow = createHtmlWorkflowAdapter(supabaseAdmin);
    const map = await workflow.lookupLessonsByCode([
      { grade_code: GRADE_SLUG, subject_code: SUBJECT_B_SLUG, lesson_code: LESSON_SLUG },
    ]);
    const key = `${GRADE_SLUG}|${SUBJECT_B_SLUG}|${LESSON_SLUG}`;
    assert.ok(map.has(key), "lookup must return scoped lesson");
    assert.equal(map.get(key).id, ids.lessonB, "must resolve to subject B's lesson");
    assert.equal(map.get(key).subject_id, ids.subjectB, "subject_id must match subject B");
  });

  it("does not query the nonexistent lessons.grade_id column", async () => {
    const workflow = createHtmlWorkflowAdapter(supabaseAdmin);
    // If the implementation still referenced lessons.grade_id, this would throw a PostgreSQL
    // column-does-not-exist error. A clean resolution proves the illegal column is gone.
    const map = await workflow.lookupLessonsByCode([
      { grade_code: GRADE_SLUG, subject_code: SUBJECT_A_SLUG, lesson_code: LESSON_SLUG },
    ]);
    assert.ok(map.size > 0, "lookup must succeed without referencing lessons.grade_id");
  });

  it("denies lookup for a missing lesson", async () => {
    const workflow = createHtmlWorkflowAdapter(supabaseAdmin);
    await assert.rejects(
      () =>
        workflow.lookupLessonsByCode([
          { grade_code: GRADE_SLUG, subject_code: SUBJECT_A_SLUG, lesson_code: "no-such-lesson" },
        ]),
      /lesson غير موجود/,
      "missing lesson must fail-closed with a clear error",
    );
  });

  it("denies lookup for a missing subject scope", async () => {
    const workflow = createHtmlWorkflowAdapter(supabaseAdmin);
    await assert.rejects(
      () =>
        workflow.lookupLessonsByCode([
          { grade_code: GRADE_SLUG, subject_code: "no-such-subject", lesson_code: LESSON_SLUG },
        ]),
      /مادة غير موجودة/,
      "missing subject must fail-closed with a clear error",
    );
  });

  it("denies lookup for a missing grade scope", async () => {
    const workflow = createHtmlWorkflowAdapter(supabaseAdmin);
    await assert.rejects(
      () =>
        workflow.lookupLessonsByCode([
          { grade_code: "no-such-grade", subject_code: SUBJECT_A_SLUG, lesson_code: LESSON_SLUG },
        ]),
      /grade غير موجود/,
      "missing grade must fail-closed with a clear error",
    );
  });

  it("enforces database-level uniqueness of (subject_id, slug)", async () => {
    // The production lookup assumes the schema prevents duplicate slugs within one subject.
    // This assertion documents that contract and fails immediately if a migration removes it.
    const { rows } = await runSql(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.lessons'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE '%subject_id%slug%';
    `);
    assert.ok(rows.length > 0, "lessons must have a UNIQUE constraint on (subject_id, slug)");
  });
});
