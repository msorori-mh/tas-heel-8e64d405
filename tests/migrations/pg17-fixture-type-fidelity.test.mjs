/**
 * PG17 fixtures must reproduce production's COLUMN TYPES, not just its column names.
 *
 * 20260826040000_independent_lesson_component_publishing.sql passed every gate and then
 * could not be created against production: it calls lower(coalesce(resource_type, ''))
 * and resource_type is the enum public.lesson_resource_type, which neither lower() nor
 * coalesce(..., '') accepts. CI missed it because the Content V3 fixture declared that
 * column as text while the Content Factory fixture declared the enum — the migration was
 * only ever exercised against the text one.
 *
 * A fixture that is looser than production does not test the migration; it tests a
 * schema nobody runs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const canonical = readFileSync("scripts/content-v3/pg17-21h-canonical-fixture.sql", "utf8");
const contentFactory = readFileSync(
  "scripts/content-factory/pg17/content-factory-10-fixture.sql",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260826040000_independent_lesson_component_publishing.sql",
  "utf8",
);

test("both PG17 fixtures declare lesson_resources.resource_type as the production enum", () => {
  for (const [name, sql] of [
    ["content-v3 canonical", canonical],
    ["content-factory-10", contentFactory],
  ]) {
    assert.match(
      sql,
      /resource_type\s+public\.lesson_resource_type/,
      `${name} fixture declares resource_type as something other than the production enum`,
    );
  }
});

test("both fixtures agree on the enum's labels", () => {
  const labels = /AS ENUM \('video','mindmap','experiment','pdf','link'\)/;
  assert.match(canonical, labels);
  assert.match(contentFactory, labels);
});

/**
 * The cast is load-bearing: without it the function cannot be created at all against a
 * schema where resource_type is an enum.
 */
test("the component guard casts the enum before lower()", () => {
  assert.match(migration, /lower\(coalesce\(_row\.resource_type::text, ''\)\) = 'mindmap'/);
  assert.match(migration, /lower\(coalesce\(_row\.resource_type::text, ''\)\) = 'experiment'/);
  assert.doesNotMatch(migration, /lower\(coalesce\(_row\.resource_type, ''\)\)/);
});
