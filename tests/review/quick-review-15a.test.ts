// TAMKEEN_QUICK_REVIEW_REUSE_15A — pure logic contract tests.
//   node --experimental-strip-types --test tests/review/quick-review-15a.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import {
  chunkSummary,
  estimateReadMinutes,
  reviewPercent,
} from "../../src/lib/review/review-format.ts";
import {
  buildReviewIndex,
  filterReviewItems,
  hasUsableSummary,
  normalizeKeyPoints,
  type ReviewItem,
} from "../../src/lib/review/review-types.ts";
import { fetchAllPaged } from "../../src/lib/review/review-data.ts";

function item(over: Partial<ReviewItem>): ReviewItem {
  return {
    lessonId: "l1",
    lessonTitle: "درس",
    subjectId: "s1",
    subjectName: "فيزياء",
    unitId: null,
    unitTitle: null,
    summary: "ملخص",
    keyPoints: [],
    studyTip: null,
    isCompleted: false,
    deliveryMode: "standard",
    semester: 1,
    order: 0,
    ...over,
  };
}

test("chunkSummary keeps short text as one chunk and preserves text", () => {
  assert.deepEqual(chunkSummary("نص قصير."), ["نص قصير."]);
  assert.deepEqual(chunkSummary("  "), []);
  const paragraphs = chunkSummary("فقرة أولى.\n\nفقرة ثانية.");
  assert.deepEqual(paragraphs, ["فقرة أولى.", "فقرة ثانية."]);
});

test("chunkSummary splits long text on Arabic/latin terminators", () => {
  const sentence = "هذه جملة طويلة نسبياً لاختبار التقسيم الصحيح للنص العربي الطويل جداً؟ ";
  const chunks = chunkSummary(sentence.repeat(6));
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 300));
});

test("estimateReadMinutes floors at one minute and returns 0 for empty", () => {
  assert.equal(estimateReadMinutes(""), 0);
  assert.equal(estimateReadMinutes("كلمة"), 1);
  assert.ok(estimateReadMinutes("أ".repeat(9000)) > 1);
});

test("reviewPercent is guarded against zero totals", () => {
  assert.equal(reviewPercent(0, 0), 0);
  assert.equal(reviewPercent(1, 2), 50);
});

test("lesson without summary is excluded from review", () => {
  assert.equal(hasUsableSummary(null), false);
  assert.equal(hasUsableSummary("   "), false);
  assert.equal(hasUsableSummary("ملخص"), true);
});

test("direct lesson (no unit) and unit lesson both supported, no fake unit", () => {
  const direct = item({ lessonId: "d1", unitId: null, unitTitle: null });
  const inUnit = item({ lessonId: "u1", unitId: "unit-1", unitTitle: "الوحدة الأولى" });
  const idx = buildReviewIndex([direct, inUnit], [{ id: "s1", name: "فيزياء" }]);
  assert.equal(idx.total, 2);
  assert.equal(idx.items[0].unitId, null);
  assert.equal(idx.items[0].unitTitle, null);
  assert.equal(idx.items[1].unitTitle, "الوحدة الأولى");
});

test("groups are built only from visible (RLS-returned) subjects with items", () => {
  const items = [item({ subjectId: "s1" }), item({ lessonId: "l2", subjectId: "s2", subjectName: "كيمياء" })];
  const idx = buildReviewIndex(items, [
    { id: "s1", name: "فيزياء" },
    { id: "s2", name: "كيمياء" },
    { id: "s3", name: "مادة بلا ملخصات" },
  ]);
  assert.deepEqual(
    idx.groups.map((g) => `${g.id}:${g.count}`),
    ["s1:1", "s2:1"],
  );
});

test("inaccessible subject is excluded because it is never returned by RLS", () => {
  // s9 is not in the subject list (RLS filtered it) => no item can reference it.
  const idx = buildReviewIndex([item({ subjectId: "s1" })], [{ id: "s1", name: "فيزياء" }]);
  assert.equal(idx.groups.find((g) => g.id === "s9"), undefined);
});

test("completed marker and counters", () => {
  const idx = buildReviewIndex(
    [item({ isCompleted: true }), item({ lessonId: "l2" })],
    [{ id: "s1", name: "فيزياء" }],
  );
  assert.equal(idx.completed, 1);
  assert.equal(reviewPercent(idx.completed, idx.total), 50);
});

test("PDF lesson with a summary is displayed", () => {
  const pdf = item({ deliveryMode: "external_pdf", summary: "ملخص الدرس" });
  const idx = buildReviewIndex([pdf], [{ id: "s1", name: "فيزياء" }]);
  assert.equal(idx.total, 1);
  assert.equal(idx.items[0].deliveryMode, "external_pdf");
});

test("subject filtering", () => {
  const items = [item({ subjectId: "s1" }), item({ lessonId: "l2", subjectId: "s2" })];
  assert.equal(filterReviewItems(items, null).length, 2);
  assert.equal(filterReviewItems(items, "s2").length, 1);
});

test("normalizeKeyPoints ignores non-string / empty entries", () => {
  assert.deepEqual(normalizeKeyPoints(["أ", "", 3, null, " ب "]), ["أ", "ب"]);
  assert.deepEqual(normalizeKeyPoints(null), []);
});

test("1000-row truncation guard: paging continues past a full page", async () => {
  const pageSize = 3;
  const total = 7;
  const calls: Array<[number, number]> = [];
  const rows = await fetchAllPaged<{ i: number }>(
    async (from, to) => {
      calls.push([from, to]);
      const slice = Array.from({ length: total }, (_, i) => ({ i })).slice(from, to + 1);
      return { data: slice, error: null };
    },
    pageSize,
    10,
  );
  assert.equal(rows.length, total);
  assert.deepEqual(calls, [
    [0, 2],
    [3, 5],
    [6, 8],
  ]);
});

test("paging stops at the max-page safety cap", async () => {
  const rows = await fetchAllPaged<{ i: number }>(
    async () => ({ data: [{ i: 1 }, { i: 2 }], error: null }),
    2,
    3,
  );
  assert.equal(rows.length, 6);
});

test("paging surfaces errors instead of returning partial data", async () => {
  await assert.rejects(
    () => fetchAllPaged(async () => ({ data: null, error: { message: "boom" } }), 2, 2),
    /boom/,
  );
});
