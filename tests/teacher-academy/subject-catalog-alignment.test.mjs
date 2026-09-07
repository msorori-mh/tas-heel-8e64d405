import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260917010000_academy_subject_catalog_alignment.sql",
  import.meta.url,
);
const migration = await readFile(migrationPath, "utf8");

test("academy catalog includes the eight canonical Grade 12 subject groups", () => {
  const expected = [
    ["QURAN", "القرآن الكريم وعلومه", 10],
    ["ISLAMIC", "التربية الإسلامية", 20],
    ["ARABIC", "اللغة العربية", 30],
    ["ENGLISH", "اللغة الإنجليزية", 40],
    ["MATHEMATICS", "الرياضيات", 50],
    ["PHYSICS", "الفيزياء", 60],
    ["CHEMISTRY", "الكيمياء", 70],
    ["BIOLOGY", "الأحياء", 80],
  ];

  for (const [code, name, order] of expected) {
    assert.ok(migration.includes(`\"code\":\"${code}\"`));
    assert.ok(migration.includes(`\"name_ar\":\"${name}\"`));
    assert.ok(migration.includes(`\"display_order\":${order}`));
  }
});

test("legacy generic subjects are deactivated without destructive deletion", () => {
  assert.match(migration, /set is_active = false\s+where code in \('SOCIAL_STUDIES', 'COMPUTER'\)/i);
  assert.doesNotMatch(migration, /delete\s+from\s+academy\.subjects/i);
});

test("deactivation fails closed when a legacy subject has dependencies", () => {
  assert.match(migration, /subjects\.is_active/);
  assert.match(migration, /academy\.teacher_profiles/);
  assert.match(migration, /academy\.program_version_subjects/);
  assert.match(migration, /ACADEMY_SUBJECT_DEACTIVATION_HAS_DEPENDENCIES/);
  assert.match(migration, /ACADEMY_SUBJECT_CATALOG_POSTCONDITION_FAILED/);
});
