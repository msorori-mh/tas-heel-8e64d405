import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = read(
  "supabase/migrations/20260830010000_grade12_subject_catalog_initializer.sql",
);
const component = read("src/components/admin/Grade12SubjectCatalogInitializer.tsx");
const page = read("src/routes/_authenticated/admin.import.tsx");

test("catalog has 14 fixed TCS-2 identities and exactly three branch groups", () => {
  const subjectCodes = migration.match(/'sub-g12-\d{3}'/g) ?? [];
  const catalogDefinition = migration.slice(
    migration.indexOf("select jsonb_build_array("),
    migration.indexOf("$function$;", migration.indexOf("select jsonb_build_array(")),
  );
  assert.equal((catalogDefinition.match(/'sub-g12-\d{3}'/g) ?? []).length, 14);
  assert.match(catalogDefinition, /'sub-g12-001','name','القرآن الكريم وعلومه'/);
  assert.match(catalogDefinition, /'sub-g12-014','name','الأحياء'/);
  assert.match(catalogDefinition, /'grp-g12-01','group_name','التربية الإسلامية'/);
  assert.match(catalogDefinition, /'grp-g12-02','group_name','اللغة العربية'/);
  assert.match(catalogDefinition, /'grp-g12-03','group_name','الرياضيات'/);
  assert.doesNotMatch(catalogDefinition, /Student's Book|Workbook/);
  assert.ok(subjectCodes.length >= 14);
});

test("subject identity is grade-bound, semester-free, and shared by Sanaa and Aden", () => {
  assert.match(migration, /where slug = 'grade-12'/);
  assert.match(migration, /track_code in \('sanaa', 'aden'\)/);
  assert.match(migration, /'expected_track_links', 28/);
  assert.match(migration, /semester, curriculum_track_id, group_code, group_name/);
  assert.match(migration, /null,\s*null,\s*nullif\(v_item->>'group_code'/);
  assert.doesNotMatch(migration, /sub-g12-(sanaa|aden)-/);
});

test("initializer is atomic, full-admin-only, preview-bound, conflict-closed, and audited", () => {
  assert.match(migration, /not public\.is_full_admin\(auth\.uid\(\)\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /GRADE12_CATALOG_STALE_PREVIEW/);
  assert.match(migration, /GRADE12_CATALOG_CONFLICT/);
  assert.match(migration, /GRADE12_CATALOG_POSTCONDITION_FAILED/);
  assert.match(migration, /GRADE12_SUBJECT_CATALOG_INITIALIZED/);
  assert.match(migration, /revoke all on function public\.admin_initialize_grade12_subject_catalog/);
  assert.match(migration, /grant execute on function public\.admin_initialize_grade12_subject_catalog/);
});

test("import page makes automatic Grade 12 initialization primary and keeps Excel for other grades", () => {
  assert.match(page, /Grade12SubjectCatalogInitializer/);
  assert.match(page, /استيراد مواد لصفوف أخرى بواسطة Excel/);
  assert.match(component, /14 مادة فعلية تحت 8 مجموعات رئيسية/);
  assert.match(component, /كتب الطالب والتمارين تضاف لاحقًا إلى المادة نفسها/);
  assert.match(component, /admin_grade12_subject_catalog_status/);
  assert.match(component, /admin_initialize_grade12_subject_catalog/);
  assert.match(component, /status\.preview_sha256/);
});
