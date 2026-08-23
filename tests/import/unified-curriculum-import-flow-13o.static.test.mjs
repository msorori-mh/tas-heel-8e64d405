import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

describe("UNIFIED_CURRICULUM_IMPORT_FLOW_13O", () => {
  it("keeps lesson order positive in the UI and server validator", () => {
    const dialog = read("src/components/admin/LessonCreateDialog.tsx");
    const server = read("src/lib/content-codes/content-codes.functions.ts");

    assert.ok(dialog.includes("useState<number>(1)"));
    assert.ok(dialog.includes("sortOrder < 1"));
    assert.ok(dialog.includes("min={1}"));
    assert.ok(dialog.includes("يبدأ من 1"));
    assert.match(
      server,
      /CreateCurriculumLessonInput[\s\S]*sortOrder: z\.number\(\)\.int\(\)\.min\(1\)/,
    );
  });

  it("guards every lesson insert, including Excel imports, at the database boundary", () => {
    const migration = read(
      "supabase/migrations/20260826020000_lesson_sort_order_guard_13o.sql",
    );

    assert.ok(migration.includes("ALTER COLUMN sort_order SET DEFAULT 1"));
    assert.ok(migration.includes("NEW.sort_order IS NULL OR NEW.sort_order <= 0"));
    assert.ok(migration.includes("COALESCE(MAX(l.sort_order), 0) + 1"));
    assert.ok(migration.includes("BEFORE INSERT ON public.lessons"));
  });

  it("presents units, lessons, and seven content templates in one import page", () => {
    const page = read("src/routes/_authenticated/admin.import.tsx");

    assert.ok(page.includes("استيراد المنهج ومحتويات الدروس"));
    assert.ok(page.includes('allowedTemplateKeys={["units"]}'));
    assert.ok(page.includes('allowedTemplateKeys={["lessons"]}'));
    assert.ok(page.includes("LESSON_CONTENT_TEMPLATE_KEYS"));
    assert.ok(page.includes("unit_code"));
    assert.ok(page.includes("اختياري"));
  });

  it("allows the shared Excel pipeline to be safely scoped per stage", () => {
    const panel = read("src/components/admin/ContentImportDryRunPanel.tsx");

    assert.ok(panel.includes("allowedTemplateKeys?: readonly ContentImportTemplateKey[]"));
    assert.ok(panel.includes("availableTemplates"));
    assert.ok(panel.includes("idPrefix"));
    assert.ok(panel.includes("availableTemplates.map"));
  });
});
