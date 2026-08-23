import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builder = readFileSync("src/components/admin/GoldenLessonPackageBuilder.tsx", "utf8");
const route = readFileSync("src/routes/_authenticated/lessons.$lessonId.tsx", "utf8");
const pipeline = readFileSync("src/lib/api/html-pipeline.functions.ts", "utf8");
const dbAdapter = readFileSync("src/lib/server/html-pipeline/db-adapter.ts", "utf8");

test("admin builder creates native v2 manifests with eight-key inputs", () => {
  assert.match(builder, /GOLDEN_CAPABILITIES_V2/);
  assert.match(builder, /GOLDEN_LESSON_SCHEMA_V2/);
  assert.match(builder, /GOLDEN_QURAN_V2/);
  assert.match(builder, /GOLDEN_CHEMISTRY_V2/);
  assert.match(builder, /interactiveActivityHtml/);
  assert.match(builder, /equationsNotApplicable/);
  assert.match(builder, /getGoldenArtifactFileContract\(capability, GOLDEN_LESSON_SCHEMA_V2\)/);
  assert.match(builder, /validateGoldenLessonArtifactBytes\([\s\S]*?GOLDEN_LESSON_SCHEMA_V2/);
  assert.match(builder, /validateGoldenLessonAnswerCoverage\([\s\S]*?GOLDEN_LESSON_SCHEMA_V2/);
});

test("HTML publication pipeline recognizes exactly the three new resource types", () => {
  for (const type of [
    "concepts_and_terms_html",
    "equations_and_laws_html",
    "interactive_activity_html",
  ]) {
    assert.match(pipeline, new RegExp(`\\| \\\"${type}\\\"`));
    assert.match(dbAdapter, new RegExp(`\\"${type}\\"`));
  }
});

test("student route gates v2 resources by READY and renders canonical relative order", () => {
  assert.match(route, /v2Ready\("conceptsAndTerms"\)/);
  assert.match(route, /v2Ready\("equationsAndLaws"\)/);
  assert.match(route, /v2Ready\("interactiveActivity"\)/);

  const learning = route.indexOf("learningActions.map");
  const concepts = route.indexOf("htmlConceptsAndTerms.length > 0", learning);
  const equations = route.indexOf("htmlEquationsAndLaws.length > 0", concepts);
  const assessments = route.indexOf("assessmentAndLaterActions.map", equations);
  const activity = route.indexOf("htmlInteractiveActivities.length > 0", assessments);
  assert.ok(learning >= 0 && learning < concepts && concepts < equations && equations < assessments && assessments < activity);
});
