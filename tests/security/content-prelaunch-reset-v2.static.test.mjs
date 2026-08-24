import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260825020000_prelaunch_content_global_reset_v2.sql",
  "utf8",
);
const ui = readFileSync(
  "src/components/admin/CurriculumPrelaunchPurgeControl.tsx",
  "utf8",
);
const layout = readFileSync("src/components/admin/AdminLayout.tsx", "utf8");
const centerNav = readFileSync(
  "src/components/admin/ContentImportCenterNav.tsx",
  "utf8",
);

test("V2 reset binds execution to a sorted exact-id manifest", () => {
  assert.match(migration, /curriculum_prelaunch_purge_manifest_v2/);
  assert.match(migration, /jsonb_agg\(id::text ORDER BY id::text\)/);
  assert.match(migration, /curriculum_prelaunch_purge_candidates_v2/);
  assert.match(migration, /PRELAUNCH_PURGE_STALE_PREVIEW/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.doesNotMatch(migration, /DISABLE\s+TRIGGER/i);
  assert.doesNotMatch(migration, /session_replication_role/i);
});

test("V2 reset deletes experimental subject scope but preserves protected roots", () => {
  for (const token of [
    "subject_curriculum_tracks",
    "subject_textbooks",
    "DELETE FROM public.subjects",
    "DELETE FROM public.units",
    "DELETE FROM public.lessons",
    "content_prelaunch_global_reset_v2",
    "content_code_allocations",
    "curriculum_tracks",
    "finance",
  ]) assert.ok(migration.includes(token), `missing V2 scope token: ${token}`);
});

test("admin sees exact candidate identities and the unified content center", () => {
  assert.match(ui, /subject_candidates/);
  assert.match(ui, /manifest_row_count/);
  assert.match(ui, /حذف جميع بيانات المحتوى التجريبية/);
  assert.match(layout, /استيراد المحتوى/);
  assert.equal((layout.match(/label: "(?:هيكل المنهج|المواد والمسارات|الوحدات|الدروس|رفع كتب المواد)"/g) ?? []).length, 0);
  for (const label of [
    "هيكل المنهج",
    "المواد والمسارات",
    "كتب المواد",
    "الوحدات",
    "الدروس",
    "الاستيراد والنشر",
  ]) assert.ok(centerNav.includes(label));
});
