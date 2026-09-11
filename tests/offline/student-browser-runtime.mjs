import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

const origin = process.env.STUDENT_PREVIEW_BASE_URL || "http://127.0.0.1:4176";
const evidence = new URL("../../artifacts/student-offline/", import.meta.url);
await mkdir(evidence, { recursive: true });
const failures = [];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on("pageerror", (error) => failures.push(error.message));
const token = "TEST_ONLY_access_token";
let profile = {
  full_name: null,
  grade_id: null,
  grade_uuid: null,
  governorate_id: null,
  curriculum_track_id: null,
  school_name: null,
};
let profileSaveCount = 0;
let rejectProfileSave = true;
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === "/rest/v1/profiles") {
    assert.equal(route.request().headers().authorization, "Bearer " + token);
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      assert.equal(body.user_id, "student-a");
      assert.equal(body.governorate_id, "gov-one");
      assert.equal(body.curriculum_track_id, "track-one");
      assert.equal(body.grade_uuid, "12");
      assert.equal(body.full_name, "طالب TEST_ONLY");
      assert(!("role" in body));
      profileSaveCount += 1;
      if (rejectProfileSave)
        return route.fulfill({
          status: 403,
          json: { message: "TEST_ONLY_write_denied", code: "42501" },
        });
      profile = body;
      return route.fulfill({ json: profile });
    }
    return route.fulfill({ json: [profile] });
  }
  if (url.pathname === "/rest/v1/grades")
    return route.fulfill({ json: [{ id: "12", name: "الثالث الثانوي" }] });
  if (url.pathname === "/rest/v1/governorates")
    return route.fulfill({ json: [{ id: "gov-one", name: "محافظة TEST_ONLY" }] });
  if (url.pathname === "/rest/v1/governorate_curriculum_map") {
    assert.equal(url.searchParams.get("governorate_id"), "eq.gov-one");
    return route.fulfill({
      json: [
        {
          curriculum_track: {
            id: "track-one",
            track_code: "TEST_ONLY",
            track_name: "منهج TEST_ONLY",
          },
        },
      ],
    });
  }
  if (url.pathname === "/rest/v1/subjects") {
    return route.fulfill({ json: [{ id: "one", name: "الكيمياء TEST_ONLY" }] });
  }
  if (url.origin === origin && url.pathname === "/api/offline-pack/manifest/one") {
    assert.equal(route.request().headers().authorization, "Bearer " + token);
    return route.fulfill({ json: { manifest } });
  }
  if (url.origin === origin && url.pathname.startsWith("/api/offline-pack/artifact/")) {
    assert.equal(route.request().headers().authorization, "Bearer " + token);
    const id = decodeURIComponent(url.pathname.split("/").at(-1));
    const entry = raw.find((item) => item.id === id);
    assert(entry, "only declared artifacts are requested");
    return route.fulfill({ body: entry.body, contentType: entry.type });
  }
  if (url.origin !== origin) return route.abort();
  return route.continue();
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const now = "2026-09-01T00:00:00.000Z";
const raw = [
  {
    id: "official-book:one",
    kind: "lesson-html",
    body: '<h2 dir="rtl">درس محفوظ للاختبار فقط</h2>',
    type: "text/html",
  },
  {
    id: "official-questions:lesson-1",
    kind: "assessment",
    type: "application/json",
    body: JSON.stringify({
      schemaVersion: 1,
      kind: "official-questions",
      lessonId: "lesson-1",
      questions: [
        {
          questionId: "official-1",
          revisionId: "revision-1",
          questionText: "ما رمز الماء؟",
          questionType: "short-answer",
          sortOrder: 0,
          options: [],
          modelAnswer: "H2O",
          explanation: "ذرتا هيدروجين وذرة أكسجين.",
          correctOptionIds: [],
        },
      ],
    }),
  },
  {
    id: "self-test:lesson-1",
    kind: "self-test",
    type: "application/json",
    body: JSON.stringify({
      schemaVersion: 1,
      kind: "self-test",
      lessonId: "lesson-1",
      questions: [
        {
          questionId: "self-1",
          revisionId: "revision-1",
          questionText: "اختر رمز الماء.",
          questionType: "multiple-choice",
          sortOrder: 0,
          options: [
            { id: "a", text: "H2O", sortOrder: 0 },
            { id: "b", text: "CO2", sortOrder: 1 },
          ],
          correctOptionId: "a",
          explanation: "الماء H2O.",
          feedbackByOption: {},
        },
      ],
    }),
  },
];
const manifest = {
  schemaVersion: 1,
  packId: "subject-one",
  revision: 1,
  generatedAt: now,
  scope: {
    gradeId: "12",
    curriculumTrackId: null,
    semester: 1,
    subjectId: "one",
    subjectTitle: "الكيمياء TEST_ONLY",
  },
  artifacts: raw.map((entry, index) => ({
    artifactId: entry.id,
    resourceId: entry.id,
    kind: entry.kind,
    lessonId: "lesson-1",
    title: index === 0 ? "شرح الدرس" : "أسئلة الدرس",
    lessonTitle: "الماء TEST_ONLY",
    relativePath: "test/" + index + ".html",
    contentType: entry.type,
    byteSize: Buffer.byteLength(entry.body),
    sha256: hash(entry.body),
    sortOrder: index,
  })),
};
try {
  await page.goto(origin);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }),
      );
    }
  });
  await page.getByRole("heading", { name: "طريقك المنظم للتفوّق" }).waitFor();
  await page.getByRole("button", { name: "دخول الطالب", exact: true }).waitFor();
  await page.getByRole("button", { name: "دخول المعلم", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "موادي المحفوظة", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "المتابعة باستخدام Google" }).count(), 0);
  assert.equal(
    await page.locator(".hero-student").evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  await page.screenshot({ path: new URL("account-choice.png", evidence).pathname, fullPage: true });
  await page.evaluate(() => {
    window.open = (url) => {
      window.__TEST_ONLY_destination = url;
      return null;
    };
  });
  await page.getByRole("button", { name: "دخول المعلم", exact: true }).click();
  assert.equal(
    await page.evaluate(() => window.__TEST_ONLY_destination),
    "https://studentamkeen.com/academy",
  );
  await page.getByRole("button", { name: "دخول الطالب", exact: true }).click();
  await page.getByText("مساحة الطلاب", { exact: true }).waitFor();
  await page.getByRole("button", { name: "المتابعة باستخدام Google" }).waitFor();
  await page.screenshot({
    path: new URL("student-sign-in.png", evidence).pathname,
    fullPage: true,
  });
  await page.getByRole("button", { name: "العودة لاختيار نوع الحساب" }).click();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "طريقك المنظم للتفوّق" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "دخول المعلم", exact: true }).isDisabled(),
    true,
  );
  await context.setOffline(false);
  // Exercise the real UI downloader. Only the server boundary and Auth session
  // are fixtures; no downloaded bytes or pack metadata are injected into IDB.
  await page.evaluate((token) => {
    localStorage.setItem(
      "sb-zbdhxyuulyovihjgeqbn-auth-token",
      JSON.stringify({
        access_token: token,
        refresh_token: "TEST_ONLY_refresh",
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: {
          id: "student-a",
          aud: "authenticated",
          role: "authenticated",
          email: "test-only@example.invalid",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-09-01T00:00:00.000Z",
        },
      }),
    );
  }, token);
  await page.reload();
  await page.getByRole("heading", { name: "موادك الدراسية", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "تنزيل المواد", exact: true }).count(), 0);
  await page.screenshot({ path: new URL("student-home.png", evidence).pathname, fullPage: true });
  await page.getByRole("button", { name: "موادي المحفوظة", exact: true }).click();
  await page.getByRole("button", { name: "عرض مواد صفي", exact: true }).click();
  await page.getByRole("heading", { name: "بياناتك الدراسية" }).waitFor();
  await page.getByLabel("الاسم الكامل").fill("طالب TEST_ONLY");
  await page.getByLabel("الصف", { exact: true }).selectOption("12");
  await page.getByLabel("المحافظة", { exact: true }).selectOption("gov-one");
  await page.getByRole("option", { name: "منهج TEST_ONLY" }).waitFor({ state: "attached" });
  await page.getByRole("button", { name: "حفظ البيانات وعرض المواد" }).click();
  await page.getByRole("alert").filter({ hasText: "لم يتم تأكيد حفظ البيانات" }).waitFor();
  assert.equal(await page.getByLabel("الاسم الكامل").inputValue(), "طالب TEST_ONLY");
  await context.setOffline(true);
  await page
    .getByText("أنت دون اتصال. يمكنك العودة إلى المواد المحفوظة.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "حفظ البيانات وعرض المواد" }).isDisabled(),
    true,
  );
  await context.setOffline(false);
  assert.equal(await page.getByLabel("الاسم الكامل").inputValue(), "طالب TEST_ONLY");
  rejectProfileSave = false;
  await page.getByRole("button", { name: "حفظ البيانات وعرض المواد" }).click();
  await page.getByText("حُفظت بياناتك الدراسية.", { exact: true }).waitFor();
  assert.equal(profileSaveCount, 2);
  await page.getByRole("button", { name: "تنزيل المادة", exact: true }).click();
  await page.getByRole("heading", { name: "الكيمياء TEST_ONLY" }).waitFor();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "موادي المحفوظة", exact: true }).click();
  await page.getByRole("heading", { name: "الكيمياء TEST_ONLY" }).waitFor();
  await page.getByRole("button", { name: "الماء TEST_ONLY", exact: true }).click();
  await page.getByLabel("إجابتك").fill("H2O — إجابة محفوظة");
  await page.getByRole("button", { name: "حفظ وعرض الإجابة النموذجية" }).click();
  await page.getByText("حُفظت إجابتك على الجهاز.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "H2O", exact: true }).click();
  await page.getByRole("button", { name: "تحقق من الإجابة", exact: true }).click();
  await page.getByText("حُفظت محاولتك على الجهاز.", { exact: false }).waitFor();
  await page.screenshot({
    path: new URL("offline-answers.png", evidence).pathname,
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "موادي المحفوظة", exact: true }).click();
  await page.getByRole("button", { name: "الماء TEST_ONLY", exact: true }).click();
  assert.equal(await page.getByLabel("إجابتك").inputValue(), "H2O — إجابة محفوظة");
  assert.equal(
    await page.getByRole("button", { name: "H2O", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  const queued = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open("tamkeen-offline-foundation", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const snapshot = await new Promise((resolve) => {
      const r = db.transaction("snapshots").objectStore("snapshots").get(1);
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return snapshot.outbox;
  });
  assert.equal(queued.length, 2);
  assert(queued.every((item) => item.status === "pending" && item.ownerId === "student-a"));
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await page.getByRole("heading", { name: "طريقك المنظم للتفوّق" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "طريقك المنظم للتفوّق" }).waitFor();
  assert.equal(await page.getByText("الماء TEST_ONLY", { exact: true }).count(), 0);
  assert.deepEqual(failures, []);
  await writeFile(
    new URL("result.json", evidence),
    JSON.stringify(
      {
        status: "PASS",
        checks: [
          "established landing assets and explicit student/teacher choices",
          "teacher opens only the dedicated academy",
          "Google-only student entry and return to account choice",
          "landing reloads offline and connected teacher entry is disabled",
          "downloads appear inside the authenticated workspace",
          "profile completion to subject download",
          "denied profile save preserves the form and permits retry",
          "profile draft survives offline/reconnect and blocks offline submit",
          "actual UI artifact download",
          "offline shell reload",
          "verified lesson read",
          "offline answer save",
          "local grading",
          "answers survive reload",
          "durable pending replay",
          "logout isolation",
        ],
        limitation:
          "Chromium runtime; physical Android upgrade and device lifecycle remain separate gates.",
      },
      null,
      2,
    ),
  );
  console.log("PASS: 16 student onboarding/offline browser runtime checks; 0 page errors.");
} finally {
  await browser.close();
}
