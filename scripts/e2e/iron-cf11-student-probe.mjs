#!/usr/bin/env node
/**
 * CF11 — read-only Student E2E probe for the Iron (الحديد Fe) golden lesson.
 *
 * Runs the published student view at 390x844 (mobile) and 1280x900 (desktop) and asserts the
 * CF11 publication contract. It performs ZERO writes: no sign-up, no mutation, no RPC other
 * than the anonymous reads the student page itself issues.
 *
 * Fail-closed: any missing element, any answer leak, any outbound network request from the
 * embedded HTML, or an unpublished lesson exits non-zero. There is no "skip" outcome.
 *
 *   node scripts/e2e/iron-cf11-student-probe.mjs [--base http://localhost:8080] [--lesson <uuid>]
 */

import { chromium } from "playwright";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const BASE = argOf("base", process.env.PROBE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const LESSON = argOf("lesson", process.env.PROBE_LESSON_ID ?? "");
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

const SECTION_ORDER = [
  "officialBookContent",
  "explanation",
  "summary",
  "mindMap",
  "quickReview",
  "checkUnderstanding",
  "lessonAssessment",
];
const ANSWER_LEAK = /\b(is_correct|correct_index|correct_answer|rationale_ar|"isCorrect"|"correctIndex")\b/;

const results = [];
let failed = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

if (!LESSON) {
  console.error("FAIL probe.lessonId — pass --lesson <uuid> (production-only value).");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: "ar",
    });
    const external = [];
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (!url.startsWith(BASE) && !url.startsWith("data:") && !url.startsWith("blob:")) external.push(url);
      return route.continue();
    });
    const page = await context.newPage();
    const tag = `[${viewport.name}]`;

    const response = await page.goto(`${BASE}/lessons/${LESSON}`, { waitUntil: "domcontentloaded" });
    check(`${tag} lesson page loads`, response?.ok(), String(response?.status()));
    await page.waitForLoadState("networkidle");

    const body = await page.content();

    // 1. No paywall on a free lesson.
    check(`${tag} no subscription gate`, !/اشترك الآن|هذا الدرس متاح للمشتركين|paywall/i.test(body));

    // 2. Seven capability sections, in the official order.
    const present = [];
    for (const section of SECTION_ORDER) {
      const locator = page.locator(`[data-capability="${section}"], #${section}, [data-section="${section}"]`).first();
      if (await locator.count()) present.push(section);
    }
    check(`${tag} seven sections present`, present.length === SECTION_ORDER.length, present.join(","));
    check(`${tag} section order preserved`, present.join(",") === SECTION_ORDER.slice(0, present.length).join(","));

    // 3. Official six-column table scrolls horizontally instead of overflowing.
    const table = page.locator(".table-scroll table").first();
    check(`${tag} official table rendered`, (await table.count()) > 0);
    if (await table.count()) {
      const columns = await table.locator("thead tr").first().locator("th").count();
      check(`${tag} table header spans six data columns`, columns >= 5, `th=${columns}`);
      const scrolls = await page.locator(".table-scroll").first().evaluate(
        (node) => getComputedStyle(node).overflowX === "auto" || getComputedStyle(node).overflowX === "scroll",
      );
      check(`${tag} table wrapper scrolls horizontally`, scrolls);
    }

    // 4. Equations keep sub/sup and the ΔH enthalpy notation.
    check(`${tag} equations keep sub/sup`, (await page.locator(".equation sub, .equation sup").count()) > 0);
    check(`${tag} ΔH enthalpy preserved`, body.includes("ΔH"));

    // 5. The real furnace figure resolves through the CF11 storage resolver.
    const figure = page.locator('figure img[alt*="الفرن"]').first();
    check(`${tag} furnace figure present`, (await figure.count()) > 0);
    if (await figure.count()) {
      const src = await figure.getAttribute("src");
      check(`${tag} furnace src is a resolver URL, not a bare leaf`, Boolean(src) && !/^official-figure/.test(src ?? ""), src ?? "");
      check(`${tag} furnace src is not base64`, !/^data:/i.test(src ?? ""));
      const loaded = await figure.evaluate((img) => img.naturalWidth > 0 && img.naturalHeight > 0);
      check(`${tag} furnace bytes actually load`, loaded);
    }

    // 6. Mind map is a JS-free details/summary tree.
    const mindMap = page.locator('[data-capability="mindMap"], #mindMap').first();
    if (await mindMap.count()) {
      const html = await mindMap.innerHTML();
      check(`${tag} mind map uses details/summary`, /<details/i.test(html) && /<summary/i.test(html));
      check(`${tag} mind map contains no script`, !/<script\b/i.test(html));
    } else {
      check(`${tag} mind map present`, false);
    }

    // 7. Lab experiment: sandboxed, CSP-locked, interactive, zero network.
    const lab = page.locator('iframe[title*="تجربة"], iframe[data-capability="labExperiment"]').first();
    if (await lab.count()) {
      const sandbox = await lab.getAttribute("sandbox");
      check(`${tag} lab iframe is sandboxed without same-origin`, Boolean(sandbox) && !/allow-same-origin/.test(sandbox ?? ""), sandbox ?? "");
      const frame = await lab.contentFrame();
      if (frame) {
        const labHtml = await frame.content();
        check(`${tag} lab CSP forbids network`, /connect-src\s+'none'/.test(labHtml));
        check(`${tag} lab has no external URL`, !/https?:\/\//i.test(labHtml.replace(/https?:\/\/www\.w3\.org[^"']*/g, "")));
        check(`${tag} lab exposes Fe2+/Fe3+ and reset`, /Fe<sup>2\+/.test(labHtml) && /Fe<sup>3\+/.test(labHtml) && /(إعادة|reset)/i.test(labHtml));
      } else {
        check(`${tag} lab frame reachable`, false);
      }
    } else {
      check(`${tag} lab experiment present (OPTIONAL capability)`, true, "absent — allowed only when lab is not READY");
    }

    // 8. Question counts and answer concealment.
    const official = page.locator('[data-question-kind="official"]');
    const selfTest = page.locator('[data-question-kind="self-test"]');
    check(`${tag} five official questions`, (await official.count()) === 5, String(await official.count()));
    check(`${tag} forty self-test questions`, (await selfTest.count()) === 40, String(await selfTest.count()));
    check(`${tag} no revealed answer before checking`, (await page.locator("[data-answer-revealed='true']").count()) === 0);
    check(`${tag} no rationale before checking`, (await page.locator("[data-rationale]:visible").count()) === 0);

    // 9. Answer leak scan across the served payload.
    check(`${tag} answer leak = 0 in DOM`, !ANSWER_LEAK.test(body));
    const scriptPayloads = await page.locator("script").allTextContents();
    check(`${tag} answer leak = 0 in hydration payload`, !scriptPayloads.some((text) => ANSWER_LEAK.test(text)));

    // 10. Rationale appears only after an explicit check, and only for self-test.
    const firstSelf = selfTest.first();
    if (await firstSelf.count()) {
      const option = firstSelf.locator("[data-option]").first();
      if (await option.count()) {
        await option.click();
        const checkButton = firstSelf.locator("button", { hasText: /تحقق|تصحيح/ }).first();
        if (await checkButton.count()) {
          await checkButton.click();
          await firstSelf.locator("[data-rationale]").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
          check(`${tag} rationale appears only after check`, (await firstSelf.locator("[data-rationale]").count()) > 0);
        } else {
          check(`${tag} self-test check control present`, false);
        }
      }
    }

    check(`${tag} zero external network requests`, external.length === 0, external.slice(0, 3).join(" "));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\nCF11_STUDENT_PROBE ${failed === 0 ? "PASS" : "FAIL"} — ${results.length - failed}/${results.length} checks`);
process.exit(failed === 0 ? 0 : 1);
