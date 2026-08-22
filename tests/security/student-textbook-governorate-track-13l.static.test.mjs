import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260827010000_student_textbook_governorate_track_enforcement_13l.sql",
    import.meta.url,
  ),
  "utf8",
);
const client = readFileSync(
  new URL("../../src/lib/textbooks/subject-textbook-client.ts", import.meta.url),
  "utf8",
);

test("student textbook discovery is a dedicated fail-closed server path", () => {
  assert.match(migration, /list_student_subject_textbooks/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /p\.user_id = auth\.uid\(\)/);
  assert.match(migration, /p\.curriculum_track_id IS NOT NULL/);
  assert.match(migration, /st\.curriculum_track_id IS NULL/);
  assert.match(migration, /st\.curriculum_track_id = p\.curriculum_track_id/);
  assert.match(migration, /p\.grade_uuid = s\.grade_id OR p\.grade_id = s\.grade_id::text/);
  assert.match(migration, /sct\.is_active IS TRUE/);
});

test("the student UI uses the scoped RPC and never the read-all table path", () => {
  assert.match(client, /rpc\(\s*"list_student_subject_textbooks"/);
  assert.doesNotMatch(client, /\.from\("subject_textbooks"\)/);
  assert.doesNotMatch(client, /isMissingBookTypeColumn/);
});

test("Taiz City and Taiz Hawban resolve to one official track each", () => {
  assert.match(migration, /'تعز المدينة', v_aden/);
  assert.match(migration, /'تعز الحوبان', v_sanaa/);
  assert.match(migration, /curriculum_track_id <> v_aden/);
  assert.match(migration, /curriculum_track_id <> v_sanaa/);
});

test("Mukalla and Seiyun are explicit Aden-track choices", () => {
  assert.match(migration, /'المكلا', v_aden/);
  assert.match(migration, /'سيئون', v_aden/);
});
