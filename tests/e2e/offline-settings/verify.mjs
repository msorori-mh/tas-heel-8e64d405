import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { preview } from "vite";
const output = "artifacts/offline-settings";
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: "tests/e2e/offline-settings/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4384, strictPort: true },
});
const names = {
  one: "الرياضيات — الفصل الأول",
  two: "اللغة العربية والقراءة والنصوص الأدبية — الفصل الثاني",
};
const content = {
  one: '<article dir="rtl">محتوى الرياضيات المحفوظ دون إنترنت</article>',
  two: '<article dir="rtl">محتوى اللغة العربية</article>',
};
function manifest(id) {
  return {
    schemaVersion: 1,
    packId: `subject-${id}`,
    revision: 1,
    generatedAt: "2026-09-13T00:00:00.000Z",
    scope: {
      gradeId: "grade-12",
      curriculumTrackId: "track-a",
      semester: id === "one" ? 1 : 2,
      subjectId: id,
      subjectTitle: names[id],
    },
    artifacts: [
      {
        artifactId: `official-book:${id}`,
        kind: "lesson-html",
        resourceId: `official-book:${id}`,
        lessonId: `lesson-${id}`,
        lessonTitle: names[id],
        title: names[id],
        relativePath: `packs/${id}.html`,
        contentType: "text/html",
        byteSize: Buffer.byteLength(content[id]),
        sha256: createHash("sha256").update(content[id]).digest("hex"),
        sortOrder: 0,
      },
    ],
  };
}
let browser;
try {
  browser = await chromium.launch({ channel: "chromium", headless: true });
  const results = [];
  for (const width of [320, 390, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    let secondFails = width === 390,
      holdSecond = false;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://127.0.0.1:4384") return route.abort();
      if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/test-only/"))
        return route.continue();
      requests.push(url.pathname);
      if (url.pathname === "/test-only/subjects") {
        assert.equal(url.searchParams.get("grade"), "grade-12");
        return route.fulfill({
          json: Object.keys(names).map((id) => ({
            id,
            name: names[id],
            curriculum_track_id: id === "one" ? "track-a" : null,
          })),
        });
      }
      const id = url.pathname.endsWith("one") ? "one" : "two";
      if (url.pathname.includes("/manifest/"))
        return route.fulfill({ json: { manifest: manifest(id), omitted: id === "two" ? 2 : 0 } });
      if (id === "two" && secondFails) return route.fulfill({ status: 503 });
      if (id === "two" && holdSecond) {
        return;
      }
      return route.fulfill({ contentType: "text/html", body: content[id] });
    });
    await page.goto("http://127.0.0.1:4384");
    const preview = page.getByRole("button", { name: "عرض المحتوى وحجم التنزيل", exact: true });
    await preview.waitFor();
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].find((b) =>
          b.textContent.includes("عرض المحتوى وحجم التنزيل"),
        )?.disabled,
    );
    assert.deepEqual(requests, []);
    await page.screenshot({ path: `${output}/settings-initial-${width}.png`, fullPage: true });
    await preview.click();
    await page.getByText("راجع الحجم ثم ابدأ التنزيل.").waitFor();
    assert.equal(requests.filter((p) => p.includes("/artifact/")).length, 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({ path: `${output}/settings-preview-${width}.png`, fullPage: true });
    const all = page.getByRole("button", { name: "تحميل الكل / استكمال التنزيل", exact: true });
    await all.click();
    if (secondFails) {
      await page.getByRole("alert").waitFor();
      assert.equal(await page.getByText("متاح دون إنترنت", { exact: true }).count(), 1);
      assert.equal(requests.filter((p) => p.endsWith("official-book%3Aone")).length, 1);
      await page.screenshot({
        path: `${output}/settings-interrupted-${width}.png`,
        fullPage: true,
      });
      secondFails = false;
      await all.click();
    }
    await page.getByText("اكتمل تنزيل المحتوى المحدد. افتح المواد والدروس كالمعتاد.").waitFor();
    assert.equal(await page.getByText("متاح دون إنترنت", { exact: true }).count(), 2);
    assert.equal(requests.filter((p) => p.endsWith("official-book%3Aone")).length, 1);
    await page.screenshot({ path: `${output}/settings-complete-${width}.png`, fullPage: true });
    const beforeOffline = requests.length;
    await context.setOffline(true);
    await page.getByRole("button", { name: "فتح درس محفوظ", exact: true }).click();
    await page
      .getByRole("article", { name: "محتوى الدرس" })
      .getByText("محتوى الرياضيات المحفوظ دون إنترنت")
      .waitFor();
    const section = page.getByRole("button", { name: "المحتوى دون إنترنت", exact: true });
    await section.click();
    await page
      .getByRole("heading", { name: "تحميل المحتوى كاملًا", exact: true })
      .waitFor({ state: "detached" });
    await section.click();
    await page.getByText("متاح دون إنترنت", { exact: true }).first().waitFor();
    assert.equal(await page.getByText("متاح دون إنترنت", { exact: true }).count(), 2);
    assert.equal(requests.length, beforeOffline);
    await context.setOffline(false);
    if (width === 390) {
      await page.getByRole("button", { name: "حذف جميع المواد المحمّلة", exact: true }).click();
      assert.equal(await page.getByText("متاح دون إنترنت", { exact: true }).count(), 2);
      await page.getByRole("button", { name: "تأكيد الحذف", exact: true }).click();
      await page.getByText("حُذفت النسخة من الجهاز. يمكنك تنزيلها مجددًا.").waitFor();
      assert.equal(await page.getByText("متاح دون إنترنت", { exact: true }).count(), 0);
      await page.getByRole("button", { name: "عرض المحتوى وحجم التنزيل", exact: true }).click();
      await page.getByText("راجع الحجم ثم ابدأ التنزيل.").waitFor();
      holdSecond = true;
      const secondRequest = page.waitForRequest((request) =>
        new URL(request.url()).pathname.endsWith("official-book%3Atwo"),
      );
      await all.click();
      await secondRequest;
      // The first saved subject stays ready when cancelling the second transfer.
      await page.getByRole("button", { name: "إيقاف", exact: true }).click();
      await page
        .getByText("توقف الطلب. الملفات المكتملة محفوظة، ويمكنك استكمال الباقي لاحقًا.")
        .waitFor();
      assert.equal(await page.getByText("متاح دون إنترنت", { exact: true }).count(), 1);
      holdSecond = false;
      await all.click();
      await page.getByText("اكتمل تنزيل المحتوى المحدد. افتح المواد والدروس كالمعتاد.").waitFor();
    }
    assert.deepEqual(errors, []);
    results.push({
      width,
      noOverflow: true,
      openingContentRequests: 0,
      previewArtifactRequests: 0,
      bothSemestersDownloaded: true,
      savedLessonOffline: true,
      savedListReopenOffline: true,
      failureResumeAndCancel: width === 390 ? "pass" : "covered at 390",
    });
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
