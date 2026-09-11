import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { preview } from "vite";
const server = await preview({
  configFile: "tests/e2e/school-directory/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4381, strictPort: true },
});
const browser = await chromium.launch({ headless: true });
const output = "artifacts/school-directory";
await mkdir(output, { recursive: true });
const results = [];
try {
  for (const width of [320, 390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === "http://127.0.0.1:4381"
        ? route.continue()
        : route.abort(),
    );
    await page.goto("http://127.0.0.1:4381");
    const choices = page.locator(".school-picker li button");
    await choices.first().waitFor();
    assert.equal(await choices.count(), 2);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `horizontal overflow ${width}`,
    );
    for (const rect of await page
      .locator(".school-picker button,.school-picker input")
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height)))
      assert.ok(rect >= 44);
    await page.screenshot({ path: `${output}/student-${width}.png`, fullPage: true });
    await choices.first().click();
    await page.getByRole("button", { name: "حفظ ومتابعة" }).click();
    assert.equal(JSON.parse(await page.getByLabel("نتيجة الحفظ").textContent()).school_id, "s1");
    await page.getByLabel("المحافظة", { exact: true }).selectOption("g2");
    await page.getByRole("button", { name: "لم أجد مدرستي", exact: true }).click();
    await page.getByLabel("اسم المدرسة المقترحة").fill("مدرسة الأمل ٢");
    await page.getByLabel("المديرية", { exact: true }).fill("المنصورة");
    await page.getByLabel("الحي أو القرية").fill("حي القاهرة");
    await page.getByRole("button", { name: "المعلم", exact: true }).click();
    await page.getByRole("button", { name: "حفظ ومتابعة" }).click();
    const proposal = JSON.parse(await page.getByLabel("نتيجة الحفظ").textContent());
    assert.equal(proposal.school_id, null);
    assert.equal(proposal.school_name, "مدرسة الأمل ٢");
    await page.screenshot({ path: `${output}/teacher-proposal-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "الإدارة", exact: true }).click();
    await page.getByRole("button", { name: "مراجعة المدرسة", exact: true }).click();
    await page.getByLabel("المدرسة المعتمدة", { exact: true }).selectOption("s1");
    const approve = page.getByRole("button", { name: "اعتماد وربط الملف", exact: true });
    assert.equal(await approve.isEnabled(), false);
    await page.getByRole("checkbox").check();
    await page.screenshot({ path: `${output}/admin-review-${width}.png`, fullPage: true });
    await approve.click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "المدارس المعتمدة", exact: true }).click();
    await page.getByRole("button", { name: "مراجعة تكرار ودمج", exact: true }).first().click();
    await page.getByLabel("المدرسة المعتمدة", { exact: true }).selectOption("s2");
    await page.getByText("السجل الذي سيبقى:", { exact: false }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "دمج ونقل الارتباطات", exact: true }).isEnabled(),
      false,
    );
    await page.screenshot({ path: `${output}/admin-merge-${width}.png`, fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `admin horizontal overflow ${width}`,
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      checks:
        "search/selection/proposal/governorate reset/admin approval/merge preview/touch targets/overflow",
      errors,
    });
    await page.close();
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ status: "PASS", live_auth_tested: false, results }, null, 2),
  );
  console.log(
    JSON.stringify({ status: "PASS", viewports: results.length, screenshots: results.length * 4 }),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
