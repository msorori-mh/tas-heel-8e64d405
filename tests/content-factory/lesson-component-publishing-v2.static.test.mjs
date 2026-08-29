import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260910010000_lesson_component_publishing_v2.sql",
  "utf8",
);
const server = readFileSync(
  "src/lib/content-factory/lesson-component-publishing-v2.functions.ts",
  "utf8",
);
const ui = readFileSync("src/components/admin/GoldenLessonPackageBuilder.tsx", "utf8");
const zip = readFileSync("src/lib/content-factory/golden-lesson-html5.ts", "utf8");
const rehearsal = readFileSync(
  "scripts/content-factory/pg17/rehearse-content-factory-11.sh",
  "utf8",
);

test("V2 is one-component publishing, not the package/materialisation pipeline", () => {
  const publishBody = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.lesson_component_publish_v2"),
    migration.indexOf("COMMENT ON FUNCTION public.lesson_component_publish_v2"),
  );
  assert.match(publishBody, /pg_advisory_xact_lock/);
  assert.match(publishBody, /status<>'VERIFIED'/);
  assert.match(publishBody, /student_can_see_this_component',true/);
  assert.doesNotMatch(publishBody, /golden_lesson_packages/);
  assert.doesNotMatch(publishBody, /golden_lesson_domain_stage/);
  assert.doesNotMatch(publishBody, /golden_lesson_materialize/);
  assert.doesNotMatch(publishBody, /canonical_manifest/);
  assert.doesNotMatch(publishBody, /CF10_LIFECYCLE_CONFLICT/);
});

test("the database contract has upload, verified, published and immutable receipts", () => {
  assert.match(migration, /'UPLOADING','VERIFIED','PUBLISHED','REJECTED'/);
  assert.match(migration, /lesson_component_publications_v2_immutable/);
  assert.match(migration, /UNIQUE \(lesson_id, capability, publication_version\)/);
  assert.match(migration, /UNIQUE CHECK \(length\(btrim\(idempotency_key\)\)/);
  assert.match(migration, /applicability='OPTIONAL'/);
  assert.match(migration, /tamkeen\.lesson_component_v2_write/);
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.golden_lesson_publish_component\(uuid,text,text\)/,
  );
});

test("all and only the seven canonical components are mapped", () => {
  for (const capability of [
    "officialBookContent",
    "tamkeenExplanationHtml",
    "lessonSummaryHtml",
    "mindMapHtml",
    "labExperimentHtml",
    "officialBookQuestions",
    "selfTest",
  ]) {
    assert.match(migration, new RegExp(`'${capability}'`));
  }
  assert.doesNotMatch(migration, /referencedImages|htmlImages|supplementalImages/);
  assert.match(zip, /data:\$\{mime\};base64/);
  assert.match(zip, /assets: \[\]/);
});

test("the UI calls exactly create, verify and publish for one selected component", () => {
  assert.match(ui, /createLessonComponentV2Upload/);
  assert.match(ui, /verifyLessonComponentV2Upload/);
  assert.match(ui, /publishLessonComponentV2/);
  assert.match(ui, /buildAnswersCompanion\(answerSets, \[capability\]\)/);
  assert.doesNotMatch(ui, /publishGoldenLessonDirect/);
  assert.doesNotMatch(ui, /preflightGoldenLessonDirect/);
  assert.doesNotMatch(ui, /جاهزية النشر على الخادم/);
  assert.doesNotMatch(ui, /حزمة جديدة|نسخة جديدة|تعارض هوية/);
  assert.match(server, /label: "رفع الملف"/);
  assert.match(server, /label: "فحص الملف"/);
  assert.match(server, /label: "نشر المكوّن"/);
});

test("server verification pins uploaded bytes and uses private intake RPCs", () => {
  assert.match(server, /"LCPV2_SOURCE"/);
  assert.match(server, /_HASH_MISMATCH/);
  assert.match(server, /validateGoldenLessonArtifactBytes/);
  assert.match(server, /validateGoldenLessonAnswerCoverage/);
  assert.match(server, /assertSelfContainedHtml/);
  assert.match(server, /LCPV2_HTML_DETACHED_RESOURCE/);
  assert.match(server, /lesson_component_verify_intake_v2/);
  assert.match(server, /lcpv2:\$\{data\.intakeId\}:publish/);
  assert.match(rehearsal, /lesson-component-publishing-v2-pg17\.sql/);
});
