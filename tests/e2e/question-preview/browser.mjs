import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const out = "artifacts/question-preview";
await mkdir(out, { recursive: true });
const server = await createServer({
  configFile: fileURLToPath(new URL("./vite.config.ts", import.meta.url)),
});
await server.listen();
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [320, 390, 1280]) {
    for (const kind of ["book", "self"]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 1280 ? 900 : 844 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:4187/?kind=${kind}`);
      await page.getByText("عدد الأسئلة: 2", { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const dialog = page.getByRole("dialog");
      const metrics = await dialog.evaluate((node) => ({
        width: node.clientWidth,
        scrollWidth: node.scrollWidth,
        dir: node.getAttribute("dir"),
        articles: node.querySelectorAll("article").length,
        viewportOverflow: document.documentElement.scrollWidth > innerWidth,
      }));
      assert.equal(metrics.dir, "rtl");
      assert.equal(metrics.articles, 2);
      assert.ok(metrics.scrollWidth <= metrics.width, "Dialog must not scroll horizontally");
      assert.equal(metrics.viewportOverflow, false);
      assert.deepEqual(errors, []);
      const correct = dialog.locator("ol li").filter({ hasText: "الإجابة الصحيحة" });
      assert.equal(await correct.count(), kind === "self" ? 2 : 1);
      if (kind === "book") assert.match(await dialog.textContent(), /الإجابة النموذجية/);
      await page.screenshot({ path: `${out}/${kind}-${width}.png` });
      const close = page.getByRole("button", { name: "إغلاق المعاينة", exact: true });
      assert.ok((await close.boundingBox()).height >= 44);
      await close.click();
      assert.equal(await page.getByRole("dialog").count(), 0);
      results.push({ width, kind, ...metrics, errors });
      await page.close();
    }
  }
  await writeFile(`${out}/browser-results.json`, JSON.stringify(results, null, 2));
  console.log(
    "PASS: both question previews at 320, 390 and 1280px; no overflow or runtime errors.",
  );
} finally {
  await browser?.close();
  await server.close();
}
