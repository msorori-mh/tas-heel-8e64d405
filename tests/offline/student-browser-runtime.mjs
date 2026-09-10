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
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin !== origin) return route.abort();
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
const canonical = (value) => {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => JSON.stringify(key) + ":" + canonical(child))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
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
  await page.evaluate(
    async ({ manifest, raw, now, digest }) => {
      const open = (name, stores) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open(name, 1);
          request.onupgradeneeded = () =>
            stores.forEach((store) => {
              if (!request.result.objectStoreNames.contains(store))
                request.result.createObjectStore(store);
            });
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const state = await open("tamkeen-offline-foundation", ["snapshots"]);
      await new Promise((resolve, reject) => {
        const tx = state.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put(
          {
            schemaVersion: 1,
            revision: 1,
            activeOwnerId: "student-a",
            updatedAt: now,
            packs: [
              {
                ownerId: "student-a",
                manifest,
                manifestSha256: digest,
                status: "ready",
                verifiedArtifactIds: manifest.artifacts.map((item) => item.artifactId),
                downloadedBytes: manifest.artifacts.reduce((sum, item) => sum + item.byteSize, 0),
                lastErrorCode: null,
                createdAt: now,
                updatedAt: now,
              },
            ],
            packBackups: [],
            outbox: [],
            learning: [],
          },
          1,
        );
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      state.close();
      const cache = await open("tamkeen-offline-artifacts", ["artifact-bytes", "artifact-meta"]);
      await new Promise((resolve, reject) => {
        const tx = cache.transaction(["artifact-bytes", "artifact-meta"], "readwrite");
        manifest.artifacts.forEach((item, index) => {
          const key = "student-a\u0000" + item.artifactId + "\u0000" + item.sha256;
          tx.objectStore("artifact-bytes").put(new TextEncoder().encode(raw[index].body), key);
          tx.objectStore("artifact-meta").put(
            {
              ownerId: "student-a",
              artifactId: item.artifactId,
              sha256: item.sha256,
              byteSize: item.byteSize,
              relativePath: item.relativePath,
              contentType: item.contentType,
            },
            key,
          );
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      cache.close();
    },
    { manifest, raw, now, digest: hash(canonical(manifest)) },
  );
  await context.setOffline(true);
  await page.reload();
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
  await page.getByRole("heading", { name: "مرحبًا بك" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "مرحبًا بك" }).waitFor();
  assert.equal(await page.getByText("الماء TEST_ONLY", { exact: true }).count(), 0);
  assert.deepEqual(failures, []);
  await writeFile(
    new URL("result.json", evidence),
    JSON.stringify(
      {
        status: "PASS",
        checks: [
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
  console.log("PASS: 7 offline browser runtime checks; 0 page errors.");
} finally {
  await browser.close();
}
