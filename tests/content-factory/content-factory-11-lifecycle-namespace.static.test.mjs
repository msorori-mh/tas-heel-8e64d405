/* ------------------------------------------------------------------------------------
 * CF11 — AUDIT REGRESSION: lifecycle namespace must be CF10-authoritative everywhere.
 *
 * The independent audit of d720dea5 found the migration using the PACKAGE-side names
 * (lessonSummary / officialBookQuestions / selfTest) as LIFECYCLE capabilities, while
 * CF10 copies stage_entries.lifecycle_capability verbatim (quickReview /
 * checkUnderstanding / lessonAssessment). This test fails if any alternate name is ever
 * reintroduced as a lifecycle capability in the migration, the PG17 fixture, or the
 * PG17 assertions.
 * ------------------------------------------------------------------------------------ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations-pending/20260824000000_content_factory_11_publication.sql";
const FIXTURE = "scripts/content-factory/pg17/content-factory-11-fixture.sql";
const ASSERTS = "scripts/content-factory/pg17/content-factory-11-assert.sql";
const STAGING = "src/lib/content-factory/golden-lesson-domain-staging.ts";
const CANONICAL = "src/lib/lessons/capability-mapping.ts";

const canonical = [
  ...readFileSync(CANONICAL, "utf8")
    .match(/V3_LIFECYCLE_CAPABILITIES = \[([^\]]+)\]/)[1]
    .matchAll(/"([A-Za-z]+)"/g),
].map(([, n]) => n);

// The package-side keys that must NEVER appear as lifecycle capability values.
const FORBIDDEN = ["lessonSummary", "lessonSummaryHtml", "officialBookQuestions", "selfTest"];

test("CF11-AUDIT/1 — CF10 staging map targets exactly the canonical lifecycle set", () => {
  const staging = readFileSync(STAGING, "utf8");
  const targets = [
    ...staging
      .match(/GOLDEN_LIFECYCLE_TARGETS[^=]*=\s*\{([\s\S]*?)\}/)[1]
      .matchAll(/"([A-Za-z]+)"\s*,?\s*$/gm),
  ].map(([, n]) => n);
  assert.deepEqual([...targets].sort(), [...canonical].sort());
});

for (const [label, file] of [
  ["migration", MIGRATION],
  ["fixture", FIXTURE],
  ["asserts", ASSERTS],
]) {
  test(`CF11-AUDIT/2 — ${label} never uses an alternate name in a lifecycle context`, () => {
    const src = readFileSync(file, "utf8");
    // Only lines that actually touch lifecycle rows/capability values can leak a wrong
    // namespace; `selfTest` remains legitimate as a plan question-group key and
    // `lessonSummaryHtml` as a package capability key.
    const lifecycleLines = src
      .split("\n")
      .filter((l) => /lifecycle|capability\s*=|capability,|_capability|capability_transition/i.test(l));
    for (const bad of FORBIDDEN) {
      const hit = lifecycleLines.find((l) => new RegExp(`'${bad}'`).test(l));
      assert.equal(
        hit,
        undefined,
        `${file} uses '${bad}' as a lifecycle capability — CF10 writes ${canonical.join("/")}\n${hit}`,
      );
    }
  });
}

test("CF11-AUDIT/3 — PG17 fixture seeds exactly the seven CF10-real lifecycle rows", () => {
  const fixture = readFileSync(FIXTURE, "utf8");
  const seeded = [
    ...fixture
      .match(/lifecycle_caps text\[\] := ARRAY\[([\s\S]*?)\]/)[1]
      .matchAll(/'([A-Za-z]+)'/g),
  ].map(([, n]) => n);
  assert.equal(seeded.length, 7);
  assert.deepEqual([...seeded].sort(), [...canonical].sort());
});
