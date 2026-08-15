// TAMKEEN_QUICK_REVIEW_REUSE_15A — static UI/security guards (no DB, no network).
//   node --test tests/review/quick-review-ui-15a.static.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const focus = read("src/components/review/FocusReader.tsx");
const page = read("src/routes/_authenticated/quick-review.tsx");
const card = read("src/components/review/ReviewCard.tsx");
const data = read("src/lib/review/review-data.ts");
const paging = read("src/lib/review/review-paging.ts");

test("Focus Mode is data-agnostic and reusable (no supabase import)", () => {
  assert.doesNotMatch(focus, /integrations\/supabase/);
  assert.doesNotMatch(focus, /supabase\./);
  assert.match(focus, /export type FocusReaderItem/);
});

test("RTL swipe: swipe-left goes next, swipe-right goes previous", () => {
  assert.match(focus, /delta <= -COMMIT_THRESHOLD\) goNext\(\)/);
  assert.match(focus, /delta >= COMMIT_THRESHOLD\) goPrev\(\)/);
  assert.match(focus, /Math\.abs\(deltaX\) > Math\.abs\(deltaY\)/);
});

test("keyboard navigation is RTL-correct and Escape closes", () => {
  assert.match(focus, /e\.key === "Escape"\) onClose\(\)/);
  assert.match(focus, /e\.key === "ArrowRight"\) goPrev\(\)/);
  assert.match(focus, /e\.key === "ArrowLeft"\) goNext\(\)/);
});

test("Android back interception pushes and pops its own sentinel", () => {
  assert.match(focus, /window\.history\.pushState\(\{ focusReader: true \}/);
  assert.match(focus, /addEventListener\("popstate"/);
  assert.match(focus, /window\.history\.back\(\)/);
});

test("scroll lock restores the previous overflow value", () => {
  assert.match(focus, /const previous = document\.body\.style\.overflow/);
  assert.match(focus, /document\.body\.style\.overflow = previous/);
});

test("first-use swipe hint is stored in sessionStorage", () => {
  assert.match(focus, /tamkeen\.focusReader\.swipeHintShown/);
  assert.match(focus, /sessionStorage/);
});

test("page renders loading / empty / error states in Arabic", () => {
  assert.match(page, /ListSkeleton/);
  assert.match(page, /تعذّر تحميل الملخصات/);
  assert.match(page, /لا توجد ملخصات متاحة بعد/);
  assert.match(page, /لا توجد ملخصات في هذه المادة/);
});

test("page is RTL and scopes the query key by user/grade/track", () => {
  assert.match(page, /dir="rtl"/);
  assert.match(page, /"quick-review",[\s\S]{0,160}curriculum_track_id/);
});

test("Quick Review is read-only: no writes anywhere in the feature", () => {
  for (const src of [page, card, focus, data]) {
    assert.doesNotMatch(src, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  }
});

test("no answer/question payload is read by the review feature", () => {
  for (const src of [page, card, focus, data]) {
    assert.doesNotMatch(src, /correct_index|correct_option|q_correct|questions|answers/);
  }
});

test("every list read is paginated with an explicit range (B5 closed)", () => {
  const rangeCount = (data.match(/\.range\(from, to\)/g) ?? []).length;
  assert.ok(rangeCount >= 5, `expected paginated reads, found ${rangeCount}`);
  assert.match(paging, /REVIEW_PAGE_SIZE = 500/);
  assert.match(paging, /REVIEW_MAX_PAGES/);
});

test("PDF lessons link to the existing lesson route (no PDF parsing here)", () => {
  assert.match(card, /to="\/lessons\/\$lessonId"/);
  assert.match(card, /افتح الدرس الكامل/);
  assert.doesNotMatch(card, /pdfjs|getDocument/);
});

test("no Mufadala hardcoded palette colors leaked into the transferred UI", () => {
  for (const src of [page, card, focus]) {
    assert.doesNotMatch(src, /\b(bg|text|border)-(green|blue|red|orange|purple|gray)-\d{2,3}\b/);
  }
});
