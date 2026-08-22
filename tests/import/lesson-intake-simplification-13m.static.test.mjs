import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = {
  importPage: "src/routes/_authenticated/admin.import.tsx",
  builder: "src/components/admin/GoldenLessonPackageBuilder.tsx",
  reviewPage: "src/routes/_authenticated/admin.content-review.tsx",
  adminLayout: "src/components/admin/AdminLayout.tsx",
  examTemplateDialog: "src/components/admin/ExamTemplateEditDialog.tsx",
  migration:
    "supabase/migrations/20260828010000_lesson_intake_simplification_13m.sql",
};

const read = (key) => readFileSync(files[key], "utf8");

describe("LESSON_INTAKE_SIMPLIFICATION_13M", () => {
  it("keeps the operator in one three-step lesson intake flow", () => {
    const page = read("importPage");
    assert.ok(page.includes("اختيار الدرس"));
    assert.ok(page.includes("رفع المحتويات السبعة"));
    assert.ok(page.includes("فحص وحفظ المسودة"));
    assert.ok(page.includes("<GoldenLessonPackageBuilder />"));
    assert.ok(!page.includes("التجهيز المطلوب قبل استيراد محتوى الدرس"));
    assert.ok(!page.includes("عمليات النشر"));
  });

  it("shows all seven canonical lesson capabilities and derives legacy metadata", () => {
    const builder = read("builder");
    assert.ok(builder.includes('officialBookContent: 1'));
    assert.ok(builder.includes('tamkeenExplanationHtml: 2'));
    assert.ok(builder.includes('lessonSummaryHtml: 3'));
    assert.ok(builder.includes('mindMapHtml: 4'));
    assert.ok(builder.includes('labExperimentHtml: 5'));
    assert.ok(builder.includes('officialBookQuestions: 6'));
    assert.ok(builder.includes('selfTest: 7'));
    assert.ok(builder.includes("selectedLesson?.semester ?? 1"));
    assert.ok(builder.includes("existingSortOrder > 0"));
    assert.ok(builder.includes("فتح مراجعة هذا الدرس"));
    assert.ok(!builder.includes("أصلحها من إدارة المنهج قبل الرفع"));
  });

  it("removes the obsolete interactive resource queue from content review", () => {
    const review = read("reviewPage");
    assert.ok(review.includes("<GoldenLessonManifestReviewPanel />"));
    assert.ok(review.includes("<GoldenLessonCf11OperatorPanel />"));
    assert.ok(!review.includes("getHtmlReviewQueueFn"));
    assert.ok(!review.includes("lesson_resources.lifecycle_status"));
    assert.ok(!review.includes("html_content_backend"));
  });

  it("keeps questions and custom exam templates out of the primary sidebar", () => {
    const layout = read("adminLayout");
    assert.ok(!layout.includes('label: "الأسئلة"'));
    assert.ok(!layout.includes('label: "قوالب الاختبارات"'));
    assert.ok(layout.includes('label: "استيراد محتوى الدروس"'));
    assert.ok(layout.includes('label: "النماذج الوزارية"'));
  });

  it("allows custom templates to target direct-to-subject lessons", () => {
    const dialog = read("examTemplateDialog");
    assert.ok(dialog.includes('queryKey: ["admin-templates-lessons", subjectId, unitId || "direct"]'));
    assert.ok(dialog.includes('query.is("unit_id", null)'));
    assert.ok(dialog.includes("الوحدة (اختياري)"));
    assert.ok(dialog.includes("disabled={saving || !subjectId}"));
  });

  it("reconciles only the empty duplicate and enforces valid operational metadata", () => {
    const migration = read("migration");
    assert.ok(migration.includes("IRON_DUPLICATE_HAS_DEPENDENCIES"));
    assert.ok(migration.includes("DELETE FROM public.lessons WHERE id = _duplicate"));
    assert.ok(migration.includes("lessons_semester_required_chk"));
    assert.ok(migration.includes("lessons_sort_order_positive_chk"));
    assert.ok(migration.includes("VALIDATE CONSTRAINT"));
  });
});
