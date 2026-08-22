import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manager = readFileSync(
  new URL("../../src/components/admin/SubjectTextbooksManager.tsx", import.meta.url),
  "utf8",
);
const api = readFileSync(
  new URL("../../src/lib/api/subject-textbook.functions.ts", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../../src/routes/_authenticated/admin.textbooks.tsx", import.meta.url),
  "utf8",
);

test("textbook intake starts with an explicit grade and cascades the subject", () => {
  assert.match(manager, /id="textbook-grade"/);
  assert.match(manager, /الصف الدراسي \*/);
  assert.match(manager, /subject\.grade_id !== gradeId/);
  assert.match(manager, /اختر الصف أولًا/);
  assert.match(api, /from\("grades"\)/);
});

test("Sanaa and Aden are a true multi-select without an Other track", () => {
  assert.match(manager, /type="checkbox"/);
  assert.match(manager, /selectedTrackIds/);
  assert.match(manager, /coversAllTracks \? null/);
  assert.doesNotMatch(manager, />آخر</);
  assert.match(api, /\["sanaa", "aden"\]/);
});

test("subject availability respects its official track bindings", () => {
  assert.match(api, /from\("subject_curriculum_tracks"\)/);
  assert.match(manager, /subjectTrackMap/);
  assert.match(manager, /selectedTrackIds\.every/);
});

test("choosing a PDF never starts an implicit upload", () => {
  assert.match(manager, /setSelectedFile\(file\)/);
  assert.match(manager, /اختيار الملف لا يرفعه/);
  assert.match(manager, /onClick=\{\(\) => void upload\(\)\}/);
  assert.match(manager, /رفع كتاب المادة/);
  assert.doesNotMatch(manager, /if \(file\) void upload\(file\)/);
});

test("the operator sees the complete binding before upload", () => {
  assert.match(route, /اختر الصف والمسار والمادة والفصل/);
  assert.match(manager, /سيُربط الكتاب بـ:/);
  assert.match(manager, /selectedGrade\.name/);
  assert.match(manager, /selectedSubject\.name/);
  assert.match(manager, /selectedTrackNames\.join/);
});

test("an existing scope is replaced instead of duplicated", () => {
  assert.match(manager, /existingScopeBook/);
  assert.match(manager, /استبدله بدل إنشاء نسخة مكررة/);
  assert.match(manager, /استبدال الكتاب الموجود/);
});
