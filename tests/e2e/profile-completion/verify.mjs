// CI-only browser regression: actual page/AuthProvider, deterministic isolated API boundary.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { preview } from "vite";
const server = await preview({
  configFile: "tests/e2e/profile-completion/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4382, strictPort: true },
});
const browser = await chromium.launch({ headless: true });
const output = "artifacts/profile-completion";
await mkdir(output, { recursive: true });
const results = [];
try {
  for (const width of [390, 1280]) {
    for (const scenario of ["selected", "manual", "options", "tracks", "save", "readback"]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === "http://127.0.0.1:4382"
          ? route.continue()
          : route.abort(),
      );
      await page.goto(`http://127.0.0.1:4382/?scenario=${scenario}`);
      if (scenario === "options") {
        await page.getByRole("alert").waitFor();
        assert.equal(
          await page.getByRole("button", { name: "حفظ ومتابعة", exact: true }).isEnabled(),
          false,
        );
        await page.getByRole("button", { name: "إعادة تحميل الصفوف والمحافظات" }).click();
      }
      await page.locator('#gr option[value="grade-1"]').waitFor({ state: "attached" });
      await page.getByLabel("الاسم الأول", { exact: true }).fill("طالب");
      await page.getByLabel("اللقب", { exact: true }).fill("تجريبي");
      await page.getByLabel("الصف الدراسي", { exact: true }).selectOption("grade-1");
      await page
        .getByLabel("المحافظة", { exact: true })
        .selectOption(scenario === "manual" ? "gov-2" : "gov-1");
      if (scenario === "tracks") {
        await page.getByRole("alert").waitFor();
        assert.equal(
          await page.getByRole("button", { name: "حفظ ومتابعة", exact: true }).isEnabled(),
          false,
        );
        await page.getByRole("button", { name: "إعادة تحميل المناهج" }).click();
      }
      if (scenario === "manual") {
        await page.getByRole("button", { name: "لم أجد مدرستي", exact: true }).click();
        await page.getByLabel("اسم المدرسة المقترحة").fill("مدرسة الأمل");
        await page.getByLabel("المنهج الدراسي", { exact: true }).selectOption("track-2");
      } else await page.locator(".school-picker li button").first().click();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `overflow ${width}`,
      );
      await page.screenshot({ path: `${output}/${scenario}-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "حفظ ومتابعة", exact: true }).click();
      if (scenario === "readback") {
        await page.getByRole("alert").waitFor();
        assert.equal(await page.getByRole("heading", { name: "تم استكمال الملف" }).count(), 0);
        assert.equal(await page.getByLabel("الاسم الأول", { exact: true }).inputValue(), "طالب");
      } else {
        if (scenario === "save") {
          await page.getByRole("alert").waitFor();
          await page.getByRole("button", { name: "حفظ ومتابعة", exact: true }).click();
        }
        await page.getByRole("heading", { name: "تم استكمال الملف" }).waitFor();
        await page.reload();
        await page.getByRole("heading", { name: "تم استكمال الملف" }).waitFor();
        const saved = JSON.parse(await page.getByLabel("الملف المحفوظ").textContent());
        assert.equal(saved.grade_uuid, "grade-1");
        assert.equal(saved.school_id, scenario === "manual" ? null : "school-1");
        assert.equal(saved.curriculum_track_id, scenario === "manual" ? "track-2" : "track-1");
      }
      assert.deepEqual(errors, []);
      results.push({ width, scenario, status: "PASS" });
      await context.close();
    }
  }
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(JSON.stringify(results));
