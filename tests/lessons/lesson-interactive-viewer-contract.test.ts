import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildInlineHtmlDocument,
  inlineHtmlCsp,
  inlineHtmlSandbox,
} from "../../src/lib/lessons/inline-html-resource.ts";

test("interactive lesson HTML keeps scripts sandboxed and blocks network", () => {
  assert.equal(inlineHtmlSandbox("SANDBOXED_NO_NETWORK"), "allow-scripts");
  const csp = inlineHtmlCsp("SANDBOXED_NO_NETWORK");
  assert.match(csp, /script-src 'unsafe-inline'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.match(csp, /form-action 'none'/);
});

test("complete HTML documents are preserved and receive the resize bridge once", () => {
  const source = "<!doctype html><html dir=\"rtl\"><head><style>.x{color:red}</style></head><body><button onclick=\"go()\">Fe</button><script>function go(){}</script></body></html>";
  const result = buildInlineHtmlDocument(source, "SANDBOXED_NO_NETWORK");
  assert.equal((result.match(/<html/gi) ?? []).length, 1);
  assert.match(result, /Content-Security-Policy/);
  assert.match(result, /tamkeen:inline-height/);
  assert.match(result, /onclick=\"go\(\)\"/);
  assert.match(result, /connect-src 'none'/);
});

test("static textbook HTML disables scripts and external network", () => {
  const result = buildInlineHtmlDocument(
    "<!doctype html><html><head></head><body><h1>الحديد</h1></body></html>",
    "STATIC_NO_SCRIPT",
  );
  assert.match(result, /script-src 'none'/);
  assert.doesNotMatch(result, /tamkeen:inline-height/);
  assert.match(result, /connect-src 'none'/);
});

test("student route exposes the seven-step rendering contracts", () => {
  const route = readFileSync("src/routes/_authenticated/lessons.$lessonId.tsx", "utf8");
  assert.match(route, /case "OFFICIAL_QUESTIONS"/);
  assert.match(route, /case "SELF_TEST"/);
  assert.match(route, /resourceType="explanation"/);
  assert.match(route, /resourceType="summary"/);
  assert.match(route, /min-h-40/);
  assert.match(route, /min-h-24/);
  assert.match(route, /check_lesson_self_test_question/);
});

test("legacy mind maps and labs are interactive by resource type", () => {
  const viewer = readFileSync("src/components/lessons/InlineHtmlResourceViewer.tsx", "utf8");
  assert.match(viewer, /resourceType === "experiment" \|\| resourceType === "mindmap"/);
  assert.match(viewer, /event\.source !== iframeRef\.current\?\.contentWindow/);
  assert.match(viewer, /Math\.min\(1600/);
});
