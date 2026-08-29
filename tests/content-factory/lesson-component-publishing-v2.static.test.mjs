import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260910010000_lesson_component_publishing_v2.sql",
  "utf8",
);
const metadataRepair = readFileSync(
  "supabase/migrations/20260910020000_lesson_component_v2_resource_metadata_contract.sql",
  "utf8",
);
const archivalRepair = readFileSync(
  "supabase/migrations/20260910030000_lesson_component_v2_superseded_intake_archival.sql",
  "utf8",
);
const errorMessages = readFileSync(
  "src/lib/content-factory/lesson-component-publishing-v2-errors.ts",
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
const productionMetadataContract = readFileSync(
  "supabase/migrations/20260824010000_cf11_rapid_launch_contract_alignment.sql",
  "utf8",
);
const pg17MetadataGuard = readFileSync(
  "scripts/content-factory/pg17/lesson-resource-metadata-production-guard.sql",
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

test("interactive V2 publications use the closed CF11 resource metadata contract", () => {
  const repairPublishBody = metadataRepair.slice(0, metadataRepair.indexOf("DO $proof$"));
  for (const sql of [repairPublishBody]) {
    const interactiveBranch = sql.slice(
      sql.indexOf("ELSIF v_intake.capability IN ('mindMapHtml','labExperimentHtml')"),
      sql.indexOf("  ELSE\n    v_writes:=v_writes+public.lesson_component_publish_questions_v2"),
    );
    assert.match(interactiveBranch, /'cf11_publication_id'/);
    assert.match(interactiveBranch, /'cf11_published_at'/);
    assert.match(interactiveBranch, /'cf11_published_by'/);
    assert.match(interactiveBranch, /'cf11_body_sha256'/);
    assert.match(interactiveBranch, /'cf11_render_mode','INTERACTIVE'/);
    assert.match(interactiveBranch, /'cf11_verified_bundle_sha256'/);
    assert.match(interactiveBranch, /'cf11_csp'/);
    assert.doesNotMatch(interactiveBranch, /'publisher','LCPV2'/);
    assert.doesNotMatch(interactiveBranch, /'publicationId'/);
  }
  const metadataFunction = (sql) => {
    const start = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.validate_lesson_resource_metadata()",
    );
    const end = sql.indexOf("$function$;", start) + "$function$;".length;
    return sql.slice(start, end);
  };
  assert.equal(metadataFunction(pg17MetadataGuard), metadataFunction(productionMetadataContract));
  assert.match(rehearsal, /lesson-resource-metadata-production-guard\.sql/);
  assert.match(rehearsal, /20260910020000_lesson_component_v2_resource_metadata_contract\.sql/);
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

test("superseded verified attempts are archived without hiding newer replacements", () => {
  assert.match(archivalRepair, /'ARCHIVED'/);
  assert.match(archivalRepair, /created_at<v_published_intake_created_at/);
  assert.match(archivalRepair, /SUPERSEDED_BY_PUBLICATION/);
  assert.match(archivalRepair, /lesson_component_archive_superseded_v2/);
  assert.match(archivalRepair, /INSERT INTO public\.audit_logs/);
  assert.doesNotMatch(archivalRepair, /DELETE FROM public\.lesson_component_intakes_v2/);
  assert.match(rehearsal, /20260910030000_lesson_component_v2_superseded_intake_archival\.sql/);
});

test("publish failures are Arabic-first with technical details collapsed", () => {
  assert.match(errorMessages, /unsupported lesson_resources\\\.metadata key/);
  assert.match(errorMessages, /الملف محفوظ ولم يفشل فحصه/);
  assert.match(errorMessages, /technicalDetail/);
  assert.match(ui, /lessonComponentPublishErrorMessage/);
  assert.match(ui, /<details/);
  assert.match(ui, /تفاصيل تقنية/);
  assert.doesNotMatch(ui, /تعذّر نشر هذا المكوّن: \{capabilityPublishError/);
});
