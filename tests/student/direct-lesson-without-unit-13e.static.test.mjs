// Static checks for DIRECT_LESSON_WITHOUT_UNIT_STUDENT_UX_13E:
// the subject page must officially support both shapes —
//   A) Subject -> Unit -> Lesson
//   B) Subject -> Lesson (lesson.unit_id IS NULL, units = 0)
// Text-level assertions only: no database, no network.
//   node --test tests/student/direct-lesson-without-unit-13e.static.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SUBJECT_PAGE = new URL(
  "../../src/routes/_authenticated/subjects.$subjectId.tsx",
  import.meta.url,
);
const src = readFileSync(SUBJECT_PAGE, "utf8");

test("both shapes are branched on a real units count, no synthesized units", () => {
  assert.match(src, /const hasUnits = units\.length > 0;/);
  assert.match(src, /hasUnits \? \(/);
  // Direct-lesson branch renders a flat lesson list.
  assert.match(src, /<LessonList lessons=\{lessons\} completed=\{done\} \/>/);
  // No fabricated unit rows anywhere in the page.
  assert.ok(!/units\.push\(|defaultUnit|fakeUnit|الوحدة الافتراضية/.test(src));
});

test("unit numbering is only rendered for real units", () => {
  assert.match(
    src,
    /\{index \? <span className="text-muted-foreground">الوحدة \{index\}: <\/span> : null\}/,
  );
});

test("empty-unit messaging never shows for direct lessons", () => {
  const idx = src.indexOf("لا توجد دروس في هذه الوحدة بعد.");
  assert.ok(idx > 0, "empty-unit message must still exist for unit mode");
  const before = src.slice(Math.max(0, idx - 200), idx);
  assert.match(before, /unitId \? \(/);
});

test("unit practice entry only renders when a real unit id exists", () => {
  const occurrences = src.match(/اختبار الوحدة/g) ?? [];
  assert.equal(occurrences.length, 2, "only the enabled unit-practice link should remain");
  assert.match(src, /\{unitId && \(\s*<div className="mt-3">/);
  assert.ok(!/disabled\s*\n\s*className=[^\n]*opacity-60/.test(src));
});

test("counters: unit chip is conditional, lesson chip is always shown", () => {
  assert.match(
    src,
    /\{hasUnits && \(\s*<span className="inline-flex items-center gap-1">\s*<Layers/,
  );
  assert.match(src, /\{lessons\.length\} درس/);
});

test("progress is computed from lessons only, independent of unit_id", () => {
  assert.match(
    src,
    /const completedCount = lessons\.filter\(\(l\) => done\.has\(l\.id\)\)\.length;/,
  );
  assert.match(
    src,
    /const percent = lessons\.length > 0 \? Math\.round\(\(completedCount \/ lessons\.length\) \* 100\) : 0;/,
  );
  assert.match(src, /const nextLesson = lessons\.find\(\(l\) => !done\.has\(l\.id\)\);/);
});

test("direct lesson navigation targets the lesson route", () => {
  assert.match(src, /to="\/lessons\/\$lessonId"\s*\n\s*params=\{\{ lessonId: l\.id \}\}/);
});

test("lesson page tolerates a null unit_id (regression)", () => {
  const lessonPage = readFileSync(
    new URL("../../src/routes/_authenticated/lessons.$lessonId.tsx", import.meta.url),
    "utf8",
  );
  assert.match(lessonPage, /unit_id: string \| null;/);
  assert.match(lessonPage, /enabled: !!lesson\?\.unit_id,/);
  assert.match(lessonPage, /\{unit && \(/);
});
