/**
 * Contract test for the current production schema: lesson_resource_type keeps
 * the legacy storage categories, while HTML subtypes use html_resource_type.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const TYPES_FILE = join(ROOT, "src", "integrations", "supabase", "types.ts");

const typesSource = readFileSync(TYPES_FILE, "utf8");

test("generated types file exists and is non-empty", () => {
  assert.ok(typesSource.length > 0, "Generated types.ts must not be empty");
});

test("generated types include lesson_resource_type enum", () => {
  assert.match(
    typesSource,
    /lesson_resource_type:\s*["']video["']/,
    "lesson_resource_type enum must include video",
  );
});

test("generated types keep HTML out of the legacy lesson_resource_type enum", () => {
  assert.match(
    typesSource,
    /lesson_resource_type:\s*["']video["']\s*\|\s*["']mindmap["']\s*\|\s*["']experiment["']\s*\|\s*["']pdf["']\s*\|\s*["']link["']/,
    "lesson_resource_type must match the current production enum",
  );
  assert.doesNotMatch(typesSource, /lesson_resource_type:[^\n]*["']html["']/);
});

test("generated types expose html_resource_type as the canonical subtype column", () => {
  assert.match(
    typesSource,
    /html_resource_type:\s*string\s*\|\s*null/,
    "lesson_resources must expose html_resource_type",
  );
});
