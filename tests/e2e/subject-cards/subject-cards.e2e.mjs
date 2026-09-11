import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { expect } from "playwright/test";

const origin = "http://127.0.0.1:4173";
const out = path.resolve("artifacts/subject-cards");
await mkdir(out, { recursive: true });
const result = {
  marker: "TEST_ONLY_SUBJECT_CARDS",
  sha: process.env.GITHUB_SHA ?? "local",
  passed: false,
  checks: [],
  measurements: [],
  pageErrors: [],
  externalRequests: [],
};
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
page.on("pageerror", (error) => result.pageErrors.push(error.message));
await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin === origin || ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname))
    return route.continue();
  result.externalRequests.push(url.origin + url.pathname);
  return route.abort();
});
const cards = () => page.locator("ul > li > .subject-card-accent:visible");
const record = (name) => result.checks.push(name);
try {
  for (const width of [320, 360, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${origin}/semesters/1`);
    await expect(page.getByRole("tab", { name: "الفصل الأول" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(cards()).toHaveCount(width < 640 ? 6 : 9);
    await page.evaluate(() => document.fonts.ready);
    const geometry = await cards().evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const title = node.querySelector(".line-clamp-2");
        const button = node.querySelector("button[aria-label^='كتب منهج']");
        const titleRect = title.getBoundingClientRect();
        return {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          top: rect.y,
          title: title.textContent.trim(),
          titleOverflow: title.scrollHeight > title.clientHeight + 1,
          buttonHeight: button.getBoundingClientRect().height,
          buttonText: button.innerText,
          titleInside: titleRect.left >= rect.left && titleRect.right <= rect.right,
          progress: node.querySelector("[role=progressbar]").getAttribute("aria-valuenow"),
        };
      }),
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `horizontal overflow at ${width}`,
    );
    assert.equal(
      new Set(geometry.slice(0, width >= 1280 ? 3 : 2).map((g) => g.top)).size,
      1,
      `column layout at ${width}`,
    );
    if (width < 640)
      assert.ok(
        geometry.every((g) => g.height === 148),
        `uniform compact height at ${width}`,
      );
    assert.ok(
      geometry.every(
        (g) =>
          !g.titleOverflow &&
          g.titleInside &&
          g.buttonHeight >= 44 &&
          g.buttonText.includes("كتب المنهج"),
      ),
      `readability and touch targets at ${width}`,
    );
    assert.equal(geometry.find((g) => g.title === "اللغة الإنجليزية").progress, "25");
    assert.equal(geometry.find((g) => g.title === "الرياضيات").progress, "8");
    assert.equal(geometry.find((g) => g.title === "القرآن الكريم").progress, "100");
    result.measurements.push({ width, geometry });
    await page.screenshot({ path: path.join(out, `subjects-${width}.png`), fullPage: true });
    record(`layout, text, progress and touch targets at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/semesters/1`);
  await expect(cards()).toHaveCount(6);
  await page.getByRole("button", { name: "عرض الكل (9)" }).click();
  await expect(cards()).toHaveCount(9);
  await page.getByRole("button", { name: "عرض أقل" }).click();
  await expect(cards()).toHaveCount(6);
  record("show all and show less");
  const quran = cards().filter({ hasText: "القرآن الكريم" });
  await expect(quran.locator(".subject-icon-tone svg")).toHaveClass(/lucide-book-open/);
  const physics = cards().filter({ hasText: "الفيزياء" });
  await expect(physics.getByRole("link")).toHaveCount(0);
  await expect(physics).toContainText("قيد التجهيز");
  record("Quran uses book icon; unpublished subject cannot navigate");
  await page.getByRole("button", { name: "كتب منهج الفيزياء: عرض أو تنزيل" }).click();
  await expect(page.getByRole("dialog")).toContainText("كتب المنهج — الفيزياء");
  await expect(page.getByRole("dialog")).toContainText(
    "لا توجد كتب منهج متاحة لهذه المادة حتى الآن.",
  );
  await page.keyboard.press("Escape");
  record("books remain independently available for an unpublished subject");
  await page.getByRole("button", { name: "كتب منهج الرياضيات: عرض أو تنزيل" }).click();
  await expect(page.getByText("اختر فرع المادة، ثم افتح كتب المنهج")).toBeVisible();
  await expect(cards()).toHaveCount(2);
  await page.getByRole("button", { name: "كتب منهج الجبر: عرض أو تنزيل" }).click();
  await expect(page.getByRole("dialog")).toContainText("كتب المنهج — الجبر");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "عودة إلى المواد" }).click();
  record("group books select the real subject branch");
  await page.getByRole("button", { name: "فتح فروع مادة الرياضيات" }).click();
  await expect(cards()).toHaveCount(2);
  await page.getByRole("tab", { name: "الفصل الثاني" }).click();
  await expect(page).toHaveURL(`${origin}/semesters/2`);
  await expect(cards()).toHaveCount(6);
  await expect(
    page.getByRole("progressbar", { name: "التقدم في اللغة الإنجليزية" }),
  ).toHaveAttribute("aria-valuenow", "75");
  await page.reload();
  await expect(page.getByRole("tab", { name: "الفصل الثاني" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goBack();
  await expect(page.getByRole("tab", { name: "الفصل الأول" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  record("semester deep link, data change, group reset, reload and browser back");
  await page.getByRole("button", { name: "عرض الكل (9)" }).click();
  await page.getByRole("tab", { name: "الفصل الأول" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "الفصل الثاني" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(cards()).toHaveCount(6);
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "الفصل الأول" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  record("RTL keyboard tabs and show-all reset");
  await page.getByRole("link").filter({ hasText: "اللغة الإنجليزية" }).click();
  await expect(page).toHaveURL(/\/subjects\/english\?semester=1$/);
  record("subject navigation preserves semester");
  await page.goto(`${origin}/semesters`);
  await expect(page.getByRole("tab", { name: "الفصل الأول" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "الفصل الثاني" }).click();
  await expect(
    page.getByRole("progressbar", { name: "التقدم في اللغة الإنجليزية" }),
  ).toHaveAttribute("aria-valuenow", "75");
  record("index entry uses the same working tabs");
  assert.deepEqual(result.pageErrors, []);
  assert.deepEqual(result.externalRequests, []);
  record("no page errors or unexpected external requests");
  result.passed = true;
} catch (error) {
  result.error = error.stack;
  await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true });
  throw error;
} finally {
  await writeFile(path.join(out, "results.json"), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({ passed: result.passed, checks: result.checks, error: result.error }),
  );
  await browser.close();
}
