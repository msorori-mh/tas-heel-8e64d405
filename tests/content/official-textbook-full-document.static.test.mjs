import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/lessons/OfficialTextbookContent.tsx", "utf8");
const standard = readFileSync("src/lib/content/official-textbook/standard.ts", "utf8");

/**
 * The official textbook layer arrives in two shapes: the structured Layer-A tree, and a
 * complete self-contained RTL HTML document that the content team authors and styles.
 *
 * Only the first carries data-layer="A_OFFICIAL_TEXTBOOK". A full document has no reason
 * to, so when the marker check ran first the document failed it and fell through to the
 * legacy plain-text branch -- which rendered the markup on screen as text, tags and all.
 * That is what a published lesson looked like to a student.
 */
test("a full HTML document is recognised before the structured-content marker", () => {
  const documentCheck = component.indexOf("<!doctype");
  const markerCheck = component.indexOf("isOfficialStructuredContent(raw)");
  const plainTextBranch = component.indexOf("whitespace-pre-wrap");

  assert.ok(documentCheck > 0, "the component must detect a full HTML document");
  assert.ok(
    documentCheck < markerCheck,
    "a full document must be handled before the data-layer marker is required",
  );
  assert.ok(
    documentCheck < plainTextBranch,
    "a full document must never reach the plain-text branch",
  );
});

/** It is rendered as a document, in the sandbox — never interpolated into the page. */
test("a full document renders in the network-free static viewer", () => {
  assert.match(component, /<InlineHtmlResourceViewer/);
  assert.match(component, /htmlResourceType="STATIC"/);
  // The comment at the top of the file mentions it; what matters is that it is not used.
  assert.doesNotMatch(component, /dangerouslySetInnerHTML\s*=\s*\{/);
});

/** The marker still means what it meant; this change did not widen it. */
test("the structured-content marker is unchanged", () => {
  assert.match(standard, /data-layer\\s\*=\\s\*\["'\]A_OFFICIAL_TEXTBOOK/);
  assert.match(component, /parseOfficialContent\(raw\)/);
});
