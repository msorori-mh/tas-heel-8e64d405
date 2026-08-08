/**
 * Contract test that generated Supabase TypeScript types include the
 * lesson_resource_type enum values required by the migrated schema.
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
    /lesson_resource_type:\s*\n\s*\|\s*["']video["']/,
    "lesson_resource_type enum must include video",
  );
});

test("generated types include html in lesson_resource_type", () => {
  assert.match(
    typesSource,
    /lesson_resource_type:[\s\S]{0,400}\|\s*["']html["']/,
    "lesson_resource_type enum must include html",
  );
});

test("generated types include interactive_html in lesson_resource_type", () => {
  assert.match(
    typesSource,
    /lesson_resource_type:[\s\S]{0,500}\|\s*["']interactive_html["']/,
    "lesson_resource_type enum must include interactive_html",
  );
});
