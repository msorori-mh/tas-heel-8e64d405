import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import {
  buildInlineHtmlDocument,
  inlineHtmlRenderModeForBody,
  inlineHtmlSandbox,
} from "../../src/lib/lessons/inline-html-resource.ts";
import { validateHtmlAgainstProfile } from "../../src/lib/lessons/html-content-standard.ts";

const bytes = readFileSync("tests/content-factory/fixtures/mindmap-physics-measurement.html");
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "ba552cc74e0baf2ca7ddb3d8c88c9ecd07305deac607e4bf55753128af9e6ac6",
);
const source = bytes.toString("utf8");
assert.equal(
  validateHtmlAgainstProfile(source, {
    profile: "INTERACTIVE_EDUCATIONAL_HTML",
    capability: "mindMapHtml",
  }).isValid,
  true,
);
const mode = inlineHtmlRenderModeForBody("INTERACTIVE", source);
assert.equal(mode, "SANDBOXED_NO_NETWORK");
assert.equal(inlineHtmlSandbox(mode), "allow-scripts");
mkdirSync("artifacts/mindmap-runtime", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(request.url()));
    await page.setContent(
      '<html><body style="margin:0"><iframe style="border:0;width:100%;height:800px" sandbox="allow-scripts"></iframe></body></html>',
    );
    await page.evaluate(
      (html) => {
        window.heights = [];
        addEventListener("message", (event) => {
          if (
            event.source === document.querySelector("iframe").contentWindow &&
            event.data.type === "tamkeen:inline-height"
          ) {
            window.heights.push(event.data.height);
          }
        });
        document.querySelector("iframe").srcdoc = html;
      },
      buildInlineHtmlDocument(source, mode),
    );
    const frame = page.frameLocator("iframe");
    const root = frame.locator(".node.level-0");
    await root.waitFor();
    const branch = frame.locator(".node.level-1").first();
    assert.equal(await branch.isVisible(), false);
    await root.click();
    assert.equal(await branch.isVisible(), true);
    await branch.click();
    const leaf = frame.getByText("تطوير الدراسات والأبحاث لخدمة حياة الإنسان", { exact: true });
    assert.equal(await leaf.isVisible(), true);
    await branch.click();
    assert.equal(await leaf.isVisible(), false);
    await root.click();
    assert.equal(await branch.isVisible(), false);
    await root.click();
    await page.waitForFunction(() => window.heights.length > 0);
    const child = page.frames().find((item) => item.parentFrame());
    assert.equal(
      await child.evaluate(() => {
        try {
          return Boolean(parent.document);
        } catch {
          return false;
        }
      }),
      false,
      "mindmap cannot read the parent origin",
    );
    assert.equal(
      await child.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    );
    await page.screenshot({
      path: `artifacts/mindmap-runtime/physics-${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    console.log(
      `PASS_MINDMAP_CHROMIUM_${width}: exact source, expand/collapse, opaque sandbox, resize bridge, zero requests`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
