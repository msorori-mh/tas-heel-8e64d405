import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(
  new URL("../../apps/teacher-academy/src/App.tsx", import.meta.url),
  "utf8",
);

test("teacher entry does not advertise or link to academy administration", () => {
  const teacherEntryStart = app.indexOf("function TeacherAuthPage");
  const teacherEntryEnd = app.indexOf("function AdminAuthPage");
  const teacherEntry = app.slice(teacherEntryStart, teacherEntryEnd);
  assert.ok(teacherEntryStart >= 0 && teacherEntryEnd > teacherEntryStart);
  assert.doesNotMatch(teacherEntry, /academyUrl\("\/admin"\)/);
  assert.doesNotMatch(teacherEntry, /دخول إدارة الأكاديمية/);
});

test("teacher-side account mismatch never offers the administration destination", () => {
  const googleMismatchStart = app.indexOf("if (!isGoogleAccount(user))");
  const profileStart = app.indexOf("if (!profile)", googleMismatchStart);
  const mismatchFlow = app.slice(googleMismatchStart, profileStart);
  assert.ok(googleMismatchStart >= 0 && profileStart > googleMismatchStart);
  assert.doesNotMatch(mismatchFlow, /academyUrl\("\/admin"\)/);
  assert.doesNotMatch(mismatchFlow, /فتح بوابة الإدارة|الانتقال إلى دخول الإدارة/);
});

test("the direct administration route remains available", () => {
  assert.match(app, /function AdminAuthPage/);
  assert.match(app, /activePortal === "admin"/);
});
