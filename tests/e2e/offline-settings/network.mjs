/** Real HTTP delivery + CDP shaping. Synthetic content; no external services/accounts. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, request as proxyRequest } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { preview } from "vite";
const output = "artifacts/offline-network";
await mkdir(output, { recursive: true });
const names = { one: "الرياضيات", two: "اللغة العربية" };
const picture =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#047857"/></svg>',
  ).toString("base64");
const bodies = Object.fromEntries(
  Object.keys(names).map((id) => [
    id,
    Buffer.from(
      `<article dir="rtl">درس ${names[id]} محفوظ<img alt="صورة الدرس" src="${picture}"/><!--${"TEST_ONLY_".repeat(12000)}--></article>`,
    ),
  ]),
);
const manifest = (id) => ({
  schemaVersion: 1,
  packId: `subject-${id}`,
  revision: 1,
  generatedAt: "2026-09-14T00:00:00Z",
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
      byteSize: bodies[id].length,
      sha256: createHash("sha256").update(bodies[id]).digest("hex"),
      sortOrder: 0,
    },
  ],
});
const ui = await preview({
  configFile: "tests/e2e/offline-settings/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4384, strictPort: true },
});
let requests = [],
  breakSecond = false;
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4386");
  if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/test-only/")) {
    const proxy = proxyRequest(
      { host: "127.0.0.1", port: 4384, path: req.url, method: req.method },
      (upstream) => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxy.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(proxy);
    return;
  }
  const row = { path: url.pathname, payloadBytes: 0, complete: false };
  requests.push(row);
  if (url.pathname.startsWith("/api/")) assert.equal(req.headers.authorization, "Bearer TEST_ONLY");
  const id = url.pathname.endsWith("one") ? "one" : "two";
  let body;
  if (url.pathname === "/test-only/subjects")
    body = Buffer.from(
      JSON.stringify(
        Object.keys(names).map((id) => ({ id, name: names[id], curriculum_track_id: "track-a" })),
      ),
    );
  else if (url.pathname.includes("/manifest/"))
    body = Buffer.from(JSON.stringify({ manifest: manifest(id), omitted: 0 }));
  else body = bodies[id];
  res.writeHead(200, {
    "content-type": url.pathname.includes("/artifact/") ? "text/html" : "application/json",
    "content-length": body.length,
    "cache-control": "no-store",
  });
  if (url.pathname.includes("/artifact/") && id === "two" && breakSecond) {
    row.payloadBytes = 16384;
    res.write(body.subarray(0, 16384));
    const timer = setTimeout(() => res.destroy(), 500);
    res.on("close", () => clearTimeout(timer));
  } else {
    row.payloadBytes = body.length;
    row.complete = true;
    res.end(body);
  }
});
await new Promise((resolve) => server.listen(4386, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: "chromium", headless: true });
  const results = [];
  for (const profile of [
    { name: "512kbps-400ms", kbps: 512, latency: 400 },
    { name: "256kbps-800ms", kbps: 256, latency: 800 },
  ]) {
    requests = [];
    breakSecond = false;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const external = [],
      errors = [];
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.hostname !== "127.0.0.1") {
        external.push(u.origin);
        return route.abort();
      }
      return route.continue();
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4386");
    const previewButton = page.getByRole("button", {
      name: "عرض المحتوى وحجم التنزيل",
      exact: true,
    });
    await previewButton.waitFor();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    const shaping = {
      offline: false,
      latency: profile.latency,
      downloadThroughput: (profile.kbps * 1000) / 8,
      uploadThroughput: 64000 / 8,
    };
    await cdp.send("Network.emulateNetworkConditions", shaping);
    const start = performance.now();
    await previewButton.click();
    await page.getByText("راجع الحجم ثم ابدأ التنزيل.").waitFor();
    const previewMs = performance.now() - start;
    assert.equal(requests.filter((r) => r.path.includes("/artifact/")).length, 0);
    const downloadStart = performance.now();
    await page.getByRole("button", { name: "تحميل الكل / استكمال التنزيل", exact: true }).click();
    await page
      .getByText("اكتمل تنزيل المحتوى المحدد. افتح المواد والدروس كالمعتاد.")
      .waitFor({ timeout: 60000 });
    const downloadMs = performance.now() - downloadStart;
    const before = requests.length;
    await context.setOffline(true);
    const openStart = performance.now();
    await page.getByRole("button", { name: "فتح درس محفوظ", exact: true }).click();
    await page
      .getByRole("article", { name: "محتوى الدرس" })
      .getByText("درس الرياضيات محفوظ")
      .waitFor();
    await page.waitForFunction(() => {
      const img = document.querySelector("article img");
      return img?.complete && img.naturalWidth === 80;
    });
    const offlineOpenMs = performance.now() - openStart;
    assert.equal(requests.length, before);
    await page.screenshot({ path: `${output}/${profile.name}-offline.png`, fullPage: true });
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    results.push({
      profile,
      fixturePayloadBytes: Object.values(bodies).reduce((n, b) => n + b.length, 0),
      previewMs,
      downloadMs,
      offlineOpenMs,
      offlineImage: true,
      offlineApiRequests: requests.length - before,
      requests: [...requests],
    });
    await context.close();
  }
  requests = [];
  breakSecond = true;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4386");
  await page.getByRole("button", { name: "عرض المحتوى وحجم التنزيل", exact: true }).click();
  await page.getByText("راجع الحجم ثم ابدأ التنزيل.").waitFor();
  const all = page.getByRole("button", { name: "تحميل الكل / استكمال التنزيل", exact: true });
  await all.click();
  await page.getByRole("alert").waitFor({ timeout: 30000 });
  assert.equal(await page.getByText("متاح دون إنترنت", { exact: true }).count(), 1);
  const beforeReload = requests.length;
  await page.reload();
  await page.getByText("متاح دون إنترنت", { exact: true }).waitFor();
  assert.equal(requests.length, beforeReload, "reload must not download content automatically");
  breakSecond = false;
  await page.getByRole("button", { name: "عرض المحتوى وحجم التنزيل", exact: true }).click();
  await page.getByText("راجع الحجم ثم ابدأ التنزيل.").waitFor();
  await all.click();
  await page.getByText("اكتمل تنزيل المحتوى المحدد. افتح المواد والدروس كالمعتاد.").waitFor();
  assert.equal(requests.filter((r) => r.path.endsWith("official-book%3Aone")).length, 1);
  assert.equal(requests.filter((r) => r.path.endsWith("official-book%3Atwo")).length, 2);
  results.push({
    scenario: "connection-reset-reload-resume",
    pass: true,
    completedFileRefetched: false,
    partialFileRestarts: true,
    interruptedPayloadBytes: 16384,
    requests: [...requests],
  });
  await context.close();
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        scope: "synthetic actual HTTP, isolated browser; not Yemen field data or backend capacity",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results.map(({ requests, ...r }) => r)));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => ui.httpServer.close(resolve));
}
