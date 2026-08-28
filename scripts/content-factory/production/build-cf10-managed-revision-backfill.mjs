#!/usr/bin/env node
/**
 * Build the one file an operator pastes into the production SQL console to give
 * production `20260827010000_cf10_managed_content_revision.sql`.
 *
 * That migration exists in this repository and CI applies it, but it never reached
 * production. Without it CF10 refuses to replace an authored lesson component:
 * re-uploading a corrected book, explanation or summary fails with
 * CF10_CONTENT_HASH_CONFLICT. Editing a component is daily editorial work, so the
 * refusal blocks the whole point of per-component publishing.
 *
 * It cannot simply be pasted as-is. Production received 20260902010000 first, which
 * added `payload_text IS NOT NULL AND` to the three conflict branches so that an
 * unauthored capability is skipped rather than written as NULL. Those are the exact
 * lines 20260827010000 pins as its preconditions, so it now finds 0 hits and refuses.
 *
 * So the file is three steps: take the guard off, apply the migration verbatim, put
 * the guard back on its new lines. The middle step is read from the migration file
 * rather than retyped -- the deployed function is ~57KB and has drifted, and every
 * hand-transcription of it in this project has been a source of error.
 *
 * Regenerate with:  node scripts/content-factory/production/build-cf10-managed-revision-backfill.mjs
 * tests/migrations/cf10-managed-revision-backfill.test.mjs fails if the committed
 * output no longer matches its sources.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");

export const MIGRATION_PATH = join(
  repo,
  "supabase",
  "migrations",
  "20260827010000_cf10_managed_content_revision.sql",
);
export const OUTPUT_PATH = join(here, "cf10-managed-revision-backfill.sql");

const TABLES = ["lesson_book_contents", "lesson_explanations", "lesson_summaries"];

const GUARDED = (table) =>
  `  ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash THEN\\n` +
  `    RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: ${table}'' USING ERRCODE = ''23514'';`;

const PLAIN = (table) =>
  `  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\\n` +
  `    RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: ${table}'' USING ERRCODE = ''23514'';`;

const MANAGED_GUARDED = (table) =>
  `  ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash THEN\\n` +
  `    IF binding_count IS DISTINCT FROM 1 THEN\\n` +
  `      RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: ${table}'' USING ERRCODE = ''23514'';`;

const MANAGED_PLAIN = (table) =>
  `  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\\n` +
  `    IF binding_count IS DISTINCT FROM 1 THEN\\n` +
  `      RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: ${table}'' USING ERRCODE = ''23514'';`;

/** A DO block that swaps `from` for `to` in each of the three conflict branches. */
function rewriteBranches(tag, label, from, to) {
  const arms = TABLES.map(
    (table) => `
  a := E'${from(table)}';
  r := E'${to(table)}';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION '${label}_ANCHOR: ${table} matched % times, expected 1', hits
      USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);`,
  ).join("\n");

  return `DO $${tag}$
DECLARE
  src text; patched text; a text; r text; hits integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text =
       'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';
  IF src IS NULL THEN
    RAISE EXCEPTION '${label}_FUNCTION_MISSING' USING ERRCODE = 'P0002';
  END IF;
  patched := src;
${arms}

  EXECUTE patched;
END
$${tag}$;`;
}

const migration = readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n").trimEnd();

export const CONTENT = `-- ============================================================================
-- إيصال 20260827010000 إلى الإنتاج: استبدال مكوّن مرفوع سابقًا
-- ============================================================================
--
-- ما يحلّه هذا الملف:
--   عند رفع نسخة مصحّحة من مكوّن سبق رفعه، ترفض CF10 الاستبدال:
--     CF10_EXECUTE_FAILED: CF10_CONTENT_HASH_CONFLICT: lesson_book_contents
--   وتصحيح مكوّن عملٌ تحريري يومي، لا حالة استثنائية.
--
-- المعالجة موجودة في المستودع منذ 20260827010000 ولم تصل الإنتاج قط. وهي أفضل
-- من مجرّد السماح بالكتابة فوق القديم:
--   * DRY_RUN يثبّت بصمة الصف القائم داخل الخطة التي يراجعها المشغّل.
--   * التحديث compare-and-swap: إن تغيّر الصف بعد المراجعة تسقط العملية كلها.
--   * لا يستبدل إلا دفعةٌ موثّقة مربوطة بـ CF09 (binding_count = 1).
--   * المكوّن المستبدَل يعود DRAFT، وبوابة الطالب تقرأ READY فقط — فلا يصل
--     الطالب محتوى جديد قبل مراجعته. وشواهد READY تُحفظ للتدقيق والتراجع.
--   * الأسئلة وطبقة الإجابات تبقى مُصدَّرة بنسخ ومغلقة كما هي.
--
-- لماذا ثلاث خطوات وليست خطوة واحدة:
--   وصل الإنتاج 20260902010000 أولًا، فأضاف payload_text IS NOT NULL إلى أسطر
--   ELSIF الثلاثة كي لا يُكتب مكوّن غير مرفوع كقيمة فارغة. وتلك الأسطر نفسها هي
--   مراسي 20260827010000، فصار يجدها صفرًا ويرفض. فنرفع الحارس، ثم نطبّق الترحيل
--   حرفيًا، ثم نعيد الحارس على أسطره الجديدة.
--
--   الخطوة الوسطى منسوخة آليًا من ملف الترحيل، غير مكتوبة يدويًا.
--
-- كل خطوة تشترط تطابق المرساة مرة واحدة بالضبط وإلا توقّف كل شيء ولم يتغيّر شيء.
--
-- مولَّد من:
--   supabase/migrations/20260827010000_cf10_managed_content_revision.sql
-- لا تحرّره يدويًا. أعد توليده بـ:
--   node scripts/content-factory/production/build-cf10-managed-revision-backfill.mjs
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1/3 — رفع الحارس مؤقتًا كي تُطابق مراسي الترحيل
-- ---------------------------------------------------------------------------
${rewriteBranches("unguard", "CF10_BACKFILL_UNGUARD", GUARDED, PLAIN)}

-- ---------------------------------------------------------------------------
-- 2/3 — الترحيل 20260827010000 حرفيًا كما هو في المستودع
-- ---------------------------------------------------------------------------
${migration}

-- ---------------------------------------------------------------------------
-- 3/3 — إعادة الحارس إلى أسطر ELSIF الجديدة
--
-- ضروري: عند payload_text NULL مع وجود صف قائم يصبح new_hash فارغًا، فيتحقّق
-- existing_hash IS DISTINCT FROM new_hash ويحاول التحديث بقيمة فارغة. الحارس
-- يمنع ذلك، فيبقى المكوّن غير المرفوع خارج الدفعة كما هو مقصود.
-- ---------------------------------------------------------------------------
${rewriteBranches("reguard", "CF10_BACKFILL_REGUARD", MANAGED_PLAIN, MANAGED_GUARDED)}

-- ---------------------------------------------------------------------------
-- تسجيل الترحيل
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260827010000', 'cf10_managed_content_revision')
ON CONFLICT (version) DO NOTHING;

-- ---------------------------------------------------------------------------
-- إثبات قبل الاعتماد: يجب أن تكون كل القيم true، وإلا تراجعت المعاملة
-- ---------------------------------------------------------------------------
DO $proof$
DECLARE d text; n integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text =
       'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';

  -- الاستبدال صار ممكنًا، ومحروسًا بـ compare-and-swap في الجداول الثلاثة
  n := (length(d) - length(replace(d, 'CF10_MANAGED_REVISION_TARGET_DRIFT', ''))) /
       length('CF10_MANAGED_REVISION_TARGET_DRIFT');
  IF n <> 3 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_PROOF_TARGETS: % of 3', n;
  END IF;
  IF position('HASH_PINNED_COMPARE_AND_SWAP' in d) = 0 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_PROOF_PLAN_PINNING_MISSING';
  END IF;

  -- الحارس عاد: لا كتابة فارغة لمكوّن لم يُرفع
  n := (length(d) - length(replace(d,
         'ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash', ''))) /
       length('ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash');
  IF n <> 3 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_PROOF_NULL_GUARD: % of 3', n;
  END IF;

  -- الإصلاحات السابقة لم تُمسّ
  IF position('LCIP-04' in d) = 0 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_PROOF_LOST_LCIP04';
  END IF;
  IF position('LCIP-05' in d) = 0 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_PROOF_LOST_LCIP05';
  END IF;
  IF position('CF10_EMPTY_PAYLOAD' in d) > 0 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_PROOF_EMPTY_PAYLOAD_RETURNED';
  END IF;

  -- والحرّاس الأصلية باقية
  IF position('cf10_assert_no_answer_leak' in d) = 0 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_PROOF_LOST_ANSWER_LEAK_GUARD';
  END IF;
  IF position('CF10_PAYLOAD_HASH_MISMATCH' in d) = 0 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_PROOF_LOST_PAYLOAD_HASH_GUARD';
  END IF;
  IF position('CF10_IDENTITY_CONFLICT' in d) = 0 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_PROOF_LOST_IDENTITY_GUARD';
  END IF;
  IF position('CF10_CONTENT_HASH_CONFLICT: questions' in d) = 0 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_PROOF_LOST_QUESTION_VERSION_GUARD';
  END IF;
  IF position('CF10_WRITE_PLAN_HASH_MISMATCH' in d) = 0 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_PROOF_LOST_WRITE_PLAN_GUARD';
  END IF;

  RAISE NOTICE 'CF10 managed revision is live: a component can be replaced, and it returns to DRAFT for review.';
END
$proof$;

COMMIT;

-- التحقّق بعد التنفيذ: كل الأعمدة true
SELECT
  position('CF10_MANAGED_REVISION_TARGET_DRIFT' in d) > 0 AS replacement_enabled,
  position('HASH_PINNED_COMPARE_AND_SWAP' in d) > 0       AS compare_and_swap_pinned,
  (SELECT count(*) FROM regexp_matches(d,
     'ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash', 'g')) = 3
                                                          AS null_payload_guarded,
  position('CF10_EMPTY_PAYLOAD' in d) = 0                 AS single_component_upload_allowed,
  position('cf10_assert_no_answer_leak' in d) > 0         AS answer_leak_guard_kept,
  position('CF10_IDENTITY_CONFLICT' in d) > 0             AS identity_guard_kept,
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
           WHERE version = '20260827010000')              AS migration_recorded
FROM (SELECT pg_get_functiondef(p.oid) AS d
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'golden_lesson_materialize_domain_batch'
         AND p.oid::regprocedure::text =
           'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)') s;
`;

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  writeFileSync(OUTPUT_PATH, CONTENT, "utf8");
  console.log(`wrote ${OUTPUT_PATH} (${CONTENT.length} bytes)`);
}
