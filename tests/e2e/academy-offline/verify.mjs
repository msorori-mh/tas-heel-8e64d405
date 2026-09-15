import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const root = path.resolve("tests/e2e/academy-offline/dist");
const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    let file;
    if (u.pathname === "/academy-shell/revision.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end('self.ACADEMY_SHELL_REVISION="fixture";');
      return;
    }
    if (u.pathname === "/academy-shell/assets.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          (await readdir(path.join(root, "assets"))).map((n) => `/academy-shell/assets/${n}`),
        ),
      );
      return;
    }
    if (u.pathname === "/academy/" || u.pathname === "/academy-shell/index.html")
      file = path.join(root, "index.html");
    else if (u.pathname.startsWith("/academy-shell/assets/"))
      file = path.join(root, "assets", path.basename(u.pathname));
    else file = path.resolve("public", path.basename(u.pathname));
    const ext = path.extname(file);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
      }[ext] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(4386, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({ channel: "chromium", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let failNotes = true;
  const sent = [];
  let fileReads = 0;
  const program = { program_version_id: "program-a", title: "البرنامج التدريبي", total_lessons: 1 };
  const lesson = {
    lesson_id: "lesson-a",
    title: "درس الأوفلاين",
    content: "نص تدريبي محفوظ",
    lesson_type: "TEXT",
    resource_url: "https://media.test/guide.pdf",
    completed: false,
    sections: [],
  };
  await context.route("https://academy.test/**", async (route) => {
    const request = route.request();
    assert.equal(request.headers().authorization, "Bearer bound-teacher-token");
    const url = request.url();
    let data = [];
    let status = 200;
    if (url.includes("teacher_profiles")) data = { status: "ACTIVE" };
    if (url.includes("list_my_learning")) data = [program];
    if (url.includes("get_learning_lessons")) data = [lesson];
    if (url.includes("complete_lesson") || url.includes("save_offline_note")) {
      sent.push({ url, body: request.postDataJSON() });
      data = null;
      if (url.includes("save_offline_note") && failNotes) {
        status = 503;
        data = { message: "temporary failure" };
      }
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  await context.route("https://media.test/**", (route) => {
    fileReads++;
    return route.fulfill({
      status: 200,
      contentType: "application/pdf",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "%PDF-1.4\nfixture",
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("PAGE", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error("BROWSER", message.text());
  });
  await page.goto("http://127.0.0.1:4386/academy/");
  await page.getByRole("button", { name: "تحميل البرنامج", exact: true }).click();
  await page.getByRole("button", { name: "فتح المحتوى المحفوظ" }).waitFor();
  assert.equal(fileReads, 1);
  await page.getByRole("button", { name: "استكمال التنزيل", exact: true }).click();
  await page
    .getByRole("button", { name: "استكمال التنزيل", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("button.primary-button")?.disabled);
  assert.equal(fileReads, 1);
  await page.evaluate(async () => {
    const s = window.offlineStore;
    await s.put("packs", {
      owner: "teacher-b",
      id: "private",
      program: { title: "سر الحساب الآخر" },
      lessons: [],
      omitted: [],
    });
    const reg = await navigator.serviceWorker.register("/academy-sw.js", { scope: "/academy/" });
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("offline worker installation timed out")), 20000),
      ),
    ]);
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "فتح المحتوى المحفوظ" }).click();
  await page.getByText("نص تدريبي محفوظ").waitFor();
  assert.equal(await page.getByText("سر الحساب الآخر").count(), 0);
  await page.getByRole("link", { name: "فتح الملف المحفوظ" }).waitFor();
  await page.getByRole("button", { name: "إكمال الدرس", exact: true }).click();
  await page.locator("textarea").fill("ملاحظتي أثناء الانقطاع");
  await page.getByRole("button", { name: "حفظ الملاحظة", exact: true }).click();
  await page.getByText("إكمال محفوظ — بانتظار المزامنة").waitFor();
  await page.locator("p").filter({ hasText: "ملاحظتي أثناء الانقطاع" }).waitFor();
  assert.equal(
    await page.evaluate(
      async () => (await window.offlineStore.readAll("notes", "teacher-a")).length,
    ),
    1,
  );
  await page.reload();
  await page.getByRole("button", { name: "فتح المحتوى المحفوظ" }).click();
  await page.locator("p").filter({ hasText: "ملاحظتي أثناء الانقطاع" }).waitFor();
  await context.setOffline(false);
  await page.getByRole("alert").filter({ hasText: "الملاحظة محفوظة" }).waitFor();
  assert.equal(
    await page.evaluate(
      async () => (await window.offlineStore.readAll("events", "teacher-a")).length,
    ),
    1,
  );
  failNotes = false;
  await page.getByRole("button", { name: "مزامنة الآن" }).click();
  await page
    .locator("p")
    .filter({ hasText: "ملاحظتي أثناء الانقطاع" })
    .filter({ hasText: "تمت المزامنة" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      async () => (await window.offlineStore.readAll("events", "teacher-a")).length,
    ),
    0,
  );
  const notes = sent.filter((x) => x.url.includes("save_offline_note"));
  assert.equal(notes.length, 2);
  assert.equal(notes[0].body.p_operation_id, notes[1].body.p_operation_id);
  assert.equal(sent.filter((x) => x.url.includes("complete_lesson")).length, 1);
  await mkdir("artifacts/academy-offline", { recursive: true });
  await page.screenshot({ path: "artifacts/academy-offline/reader-mobile.png", fullPage: true });
  console.log(
    "PASS: verified file reuse, cold offline reload, account isolation, progress/note durability, failed-request retry, bound token, automatic reconnect sync",
  );
  await context.close();
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
