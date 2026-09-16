import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("global social preview describes the current Tamkeen positioning", () => {
  const root = read("src/routes/__root.tsx");

  assert.match(root, /تمكين الطالب \| للطلاب والمعلمين/);
  assert.match(root, /الخرائط الذهنية/);
  assert.match(root, /محاكاة التجارب المعملية/);
  assert.match(root, /الاختبارات التفاعلية والوزارية/);
  assert.match(root, /تؤهل الطالب للفهم والتفوّق/);
  assert.match(root, /تعمل دون إنترنت/);
  assert.doesNotMatch(root, /لجميع محافظات الجمهورية/);
  assert.match(root, /og:image/);
  assert.match(root, /twitter:image/);
  assert.match(root, /social-preview-2026\.png/);
  assert.doesNotMatch(root, /منصتك الذكية للاستعداد للثانوية/);
});

test("the landing page does not restore stale preview copy", () => {
  const landing = read("src/routes/index.tsx");

  assert.match(landing, /تمكين الطالب \| للطلاب والمعلمين/);
  assert.match(landing, /social-preview-2026\.png/);
  assert.doesNotMatch(landing, /منصتك الذكية للاستعداد للثانوية/);
});
