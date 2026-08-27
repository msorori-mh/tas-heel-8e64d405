import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_LESSON_CAPABILITY_COLUMNS,
  resolveAdminLessonCapabilityIndicator,
} from "./admin-lesson-capability-table";

test("admin lesson table exposes the exact seven Content V3 columns in journey order", () => {
  assert.deepEqual(
    ADMIN_LESSON_CAPABILITY_COLUMNS.map(({ type, label }) => ({ type, label })),
    [
      { type: "PRIMARY_CONTENT", label: "محتوى الكتاب" },
      { type: "EXPLANATION", label: "شرح تمكين" },
      { type: "SUMMARY", label: "ملخص الدرس" },
      { type: "MINDMAP", label: "الخريطة الذهنية" },
      { type: "PRACTICAL", label: "التجربة المعملية" },
      { type: "OFFICIAL_QUESTIONS", label: "أسئلة الكتاب" },
      { type: "SELF_TEST", label: "اختبر فهمك" },
    ],
  );
});

test("admin indicator distinguishes editorial states and fails closed on conflicts", () => {
  assert.equal(resolveAdminLessonCapabilityIndicator({ available: true }), "AVAILABLE");
  assert.equal(
    resolveAdminLessonCapabilityIndicator({ available: true, lifecycleStatus: "DRAFT" }),
    "DRAFT",
  );
  assert.equal(
    resolveAdminLessonCapabilityIndicator({ available: true, lifecycleStatus: "REVIEW" }),
    "REVIEW",
  );
  assert.equal(
    resolveAdminLessonCapabilityIndicator({ available: false, lifecycleStatus: "READY" }),
    "CONFLICT",
  );
  assert.equal(resolveAdminLessonCapabilityIndicator({ available: false }), "ABSENT");
});
