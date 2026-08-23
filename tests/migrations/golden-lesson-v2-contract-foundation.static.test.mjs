import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL(
  '../../supabase/migrations/20260826030000_golden_lesson_package_v2_contract_foundation.sql',
  import.meta.url,
), 'utf8');

test('pins V1 and V2 schemas without rewriting V1 history', () => {
  assert.match(sql, /tamkeen\.golden-lesson-package\.v1/);
  assert.match(sql, /tamkeen\.golden-lesson-package\.v2/);
  assert.match(sql, /ELSE 'tamkeen\.golden-lesson-package\.v1'/);
  assert.doesNotMatch(sql, /DELETE FROM public\.golden_lesson/);
});

test('V2 exact capability set is the seven numbered contents plus optional activity', () => {
  for (const capability of [
    'officialBookContent', 'tamkeenExplanationHtml', 'lessonSummaryHtml',
    'conceptsAndTermsHtml', 'equationsAndLawsHtml', 'officialBookQuestions',
    'selfTest', 'interactiveActivityHtml',
  ]) assert.match(sql, new RegExp(`'${capability}'`));
  assert.match(sql, /GLV2_ACTIVITY_MUST_BE_OPTIONAL_OR_NA/);
  assert.match(sql, /GLV2_EQUATIONS_APPLICABILITY_INVALID/);
  assert.match(sql, /GLV2_NA_MUST_NOT_HAVE_PAYLOAD/);
  const v2CapabilityBlock = sql.match(
    /ELSIF _schema = 'tamkeen\.golden-lesson-package\.v2' THEN\n\s+RETURN ARRAY\[([^;]+);/,
  )?.[1] ?? '';
  assert.doesNotMatch(v2CapabilityBlock, /mindMapHtml|labExperimentHtml/);
});

test('new HTML subtypes and lifecycle meanings are independent', () => {
  assert.match(sql, /concepts_and_terms_html/);
  assert.match(sql, /equations_and_laws_html/);
  assert.match(sql, /interactive_activity_html/);
  assert.match(sql, /'lifecycle','conceptsAndTerms'/);
  assert.match(sql, /'lifecycle','equationsAndLaws'/);
  assert.match(sql, /'lifecycle','interactiveActivity'/);
  assert.doesNotMatch(sql, /conceptsAndTermsHtml[^\n]+mindMap/);
});

test('CF08 V2 is service-role only and hash pinned', () => {
  assert.match(sql, /golden_lesson_stage_domain_bundle_v2/);
  assert.match(sql, /extensions\.digest\(payload,'sha256'\)/);
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /TO service_role/);
});

test('CF04 V2 entry point validates schema while preserving subject profiles', () => {
  assert.match(sql, /assert_golden_lesson_manifest_v2/);
  assert.match(sql, /golden_lesson_stage_manifest_v2/);
  assert.match(sql, /_manifest->>'schema' IS DISTINCT FROM 'tamkeen\.golden-lesson-package\.v2'/);
  assert.match(sql, /GOLDEN_QURAN_V1/);
  assert.match(sql, /GOLDEN_CHEMISTRY_V1/);
  assert.match(sql, /extensions\.digest\(convert_to\(_manifest::text,'UTF8'\),'sha256'\)/);
});

test('CF10 and CF11 remain fail-closed until their complete V2 branches exist', () => {
  assert.match(sql, /_stage IN \('CF10','CF11'\)/);
  assert.match(sql, /GLV2_%_IMPLEMENTATION_REQUIRED/);
  assert.match(sql, /USING ERRCODE='0A000'/);
});

test('rollback is forward-audit-safe', () => {
  assert.match(sql, /Do not roll back after a V2 batch is staged/);
  assert.match(sql, /Never delete stage, publication, question, answer, or audit rows/);
  assert.doesNotMatch(sql, /DROP TABLE public\.golden_lesson/);
});
