-- ============================================================================
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
DO $unguard$
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
    RAISE EXCEPTION 'CF10_BACKFILL_UNGUARD_FUNCTION_MISSING' USING ERRCODE = 'P0002';
  END IF;
  patched := src;

  a := E'  ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash THEN\n    RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_book_contents'' USING ERRCODE = ''23514'';';
  r := E'  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\n    RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_book_contents'' USING ERRCODE = ''23514'';';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_UNGUARD_ANCHOR: lesson_book_contents matched % times, expected 1', hits
      USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  a := E'  ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash THEN\n    RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_explanations'' USING ERRCODE = ''23514'';';
  r := E'  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\n    RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_explanations'' USING ERRCODE = ''23514'';';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_UNGUARD_ANCHOR: lesson_explanations matched % times, expected 1', hits
      USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  a := E'  ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash THEN\n    RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_summaries'' USING ERRCODE = ''23514'';';
  r := E'  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\n    RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_summaries'' USING ERRCODE = ''23514'';';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_UNGUARD_ANCHOR: lesson_summaries matched % times, expected 1', hits
      USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  EXECUTE patched;
END
$unguard$;

-- ---------------------------------------------------------------------------
-- 2/3 — الترحيل 20260827010000 حرفيًا كما هو في المستودع
-- ---------------------------------------------------------------------------
-- CF10 managed revision support for the three non-versioned authored targets.
--
-- A verified package version is explicitly presented as a "new version" in the
-- admin UI, but CF10 previously rejected every changed lesson-book, explanation,
-- or summary payload. This forward migration keeps the conflict guard while
-- turning it into an explicit, hash-pinned replacement:
--   * DRY_RUN pins the live target hashes and lifecycle state in the reviewed plan.
--   * EXECUTE re-opens matching lifecycle rows as DRAFT while preserving READY evidence.
--   * only an authoritative CF09-bound batch may replace a target.
--   * the update is compare-and-swap; drift aborts the whole transaction.
--   * questions and answer-layer rows remain versioned and fail closed unchanged.

DO $migration$
DECLARE
  src text;
  old_plan text;
  new_plan text;
  old_gate text;
  new_gate text;
  old_book text;
  new_book text;
  old_explanation text;
  new_explanation text;
  old_summary text;
  new_summary text;
  occurrences integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text =
       'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';

  IF src IS NULL THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_FUNCTION_NOT_FOUND';
  END IF;
  IF position('CF10_MANAGED_REVISION_TARGET_DRIFT' in src) > 0 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_ALREADY_APPLIED';
  END IF;

  old_plan := $old$  plan_sha := public.cf10_text_sha256(plan::text);$old$;
  new_plan := $new$  -- Pin the live rows and lifecycle state that the operator is reviewing. Any
  -- change after DRY_RUN produces a different plan hash and fails before writes.
  plan := plan || jsonb_build_object(
    'managedRevision', jsonb_build_object(
      'policy', 'HASH_PINNED_COMPARE_AND_SWAP',
      'targets', jsonb_build_object(
        'lesson_book_contents', jsonb_build_object(
          'existingHash', (SELECT public.cf10_text_sha256(content)
                             FROM public.lesson_book_contents
                            WHERE lesson_id = lesson_row.id),
          'incomingHash', payloads->'officialBookContent'->>'sha256'),
        'lesson_explanations', jsonb_build_object(
          'existingHash', (SELECT public.cf10_text_sha256(content)
                             FROM public.lesson_explanations
                            WHERE lesson_id = lesson_row.id
                              AND explanation_code IN (
                                external_lesson_code || '-EXP',
                                lower(external_lesson_code || '-EXP'))
                            LIMIT 1),
          'incomingHash', payloads->'tamkeenExplanationHtml'->>'sha256'),
        'lesson_summaries', jsonb_build_object(
          'existingHash', (SELECT public.cf10_text_sha256(summary)
                             FROM public.lesson_summaries
                            WHERE lesson_id = lesson_row.id),
          'incomingHash', payloads->'lessonSummaryHtml'->>'sha256')),
      'lifecycle', coalesce((
        SELECT jsonb_object_agg(
                 e.lifecycle_capability,
                 jsonb_build_object(
                   'status', l.status,
                   'applicability', l.applicability,
                   'draftHash', l.draft_hash,
                   'incomingHash', e.source_sha256))
          FROM public.golden_lesson_domain_stage_entries e
          LEFT JOIN public.lesson_capability_lifecycle l
            ON l.lesson_id = lesson_row.id
           AND l.capability = e.lifecycle_capability
         WHERE e.batch_id = _batch_id
      ), '{}'::jsonb)));

  plan_sha := public.cf10_text_sha256(plan::text);$new$;

  old_gate := $old$  IF _expected_plan_sha256 IS DISTINCT FROM plan_sha THEN
    RAISE EXCEPTION 'CF10_WRITE_PLAN_HASH_MISMATCH' USING ERRCODE = '23514';
  END IF;$old$;
  new_gate := $new$  IF _expected_plan_sha256 IS DISTINCT FROM plan_sha THEN
    RAISE EXCEPTION 'CF10_WRITE_PLAN_HASH_MISMATCH' USING ERRCODE = '23514';
  END IF;

  -- Lock every pre-existing lifecycle target and prove that it still matches the
  -- reviewed plan before any row is re-opened as a new draft.
  PERFORM 1
    FROM public.lesson_capability_lifecycle l
    JOIN public.golden_lesson_domain_stage_entries e
      ON e.lifecycle_capability = l.capability
     AND e.batch_id = _batch_id
   WHERE l.lesson_id = lesson_row.id
   FOR UPDATE OF l;
  IF EXISTS (
    SELECT 1
      FROM public.golden_lesson_domain_stage_entries e
     WHERE e.batch_id = _batch_id
       AND (plan #>> ARRAY['managedRevision','lifecycle',e.lifecycle_capability,'status'])
           IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.lesson_capability_lifecycle l
          WHERE l.lesson_id = lesson_row.id
            AND l.capability = e.lifecycle_capability
            AND l.status::text IS NOT DISTINCT FROM
                (plan #>> ARRAY['managedRevision','lifecycle',e.lifecycle_capability,'status'])
            AND l.applicability::text IS NOT DISTINCT FROM
                (plan #>> ARRAY['managedRevision','lifecycle',e.lifecycle_capability,'applicability'])
            AND l.draft_hash IS NOT DISTINCT FROM
                (plan #>> ARRAY['managedRevision','lifecycle',e.lifecycle_capability,'draftHash'])))
  THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_LIFECYCLE_DRIFT' USING ERRCODE = '23514';
  END IF;

  -- A new, reviewed package version starts a new draft for the exact staged set.
  -- READY evidence is deliberately preserved for audit/rollback; it is never served
  -- while status is DRAFT. Applicability changes remain a hard conflict below.
  UPDATE public.lesson_capability_lifecycle l
     SET status = 'DRAFT',
         draft_hash = e.source_sha256,
         draft_updated_at = now(),
         reviewed_by = NULL,
         reviewed_at = NULL,
         updated_at = now()
    FROM public.golden_lesson_domain_stage_entries e
   WHERE e.batch_id = _batch_id
     AND l.lesson_id = lesson_row.id
     AND l.capability = e.lifecycle_capability
     AND l.applicability::text = e.applicability
     AND (
       l.status IS DISTINCT FROM 'DRAFT'
       OR l.draft_hash IS DISTINCT FROM e.source_sha256
       OR l.reviewed_by IS NOT NULL
       OR l.reviewed_at IS NOT NULL
     );
  GET DIAGNOSTICS rc = ROW_COUNT;
  lifecycle_written := lifecycle_written + rc;
  domain_writes := domain_writes + rc;$new$;

  old_book := $old$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_book_contents' USING ERRCODE = '23514';
  END IF;$old$;
  new_book := $new$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    IF binding_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_book_contents' USING ERRCODE = '23514';
    END IF;
    UPDATE public.lesson_book_contents
       SET content = payload_text
     WHERE lesson_id = lesson_row.id
       AND public.cf10_text_sha256(content) =
           (plan #>> ARRAY['managedRevision','targets','lesson_book_contents','existingHash']);
    GET DIAGNOSTICS rc = ROW_COUNT;
    IF rc <> 1 THEN
      RAISE EXCEPTION 'CF10_MANAGED_REVISION_TARGET_DRIFT: lesson_book_contents'
        USING ERRCODE = '23514';
    END IF;
    domain_writes := domain_writes + rc;
  END IF;$new$;

  old_explanation := $old$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_explanations' USING ERRCODE = '23514';
  END IF;$old$;
  new_explanation := $new$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    IF binding_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_explanations' USING ERRCODE = '23514';
    END IF;
    UPDATE public.lesson_explanations
       SET content = payload_text
     WHERE lesson_id = lesson_row.id
       AND explanation_code IN (
         external_lesson_code || '-EXP',
         lower(external_lesson_code || '-EXP'))
       AND public.cf10_text_sha256(content) =
           (plan #>> ARRAY['managedRevision','targets','lesson_explanations','existingHash']);
    GET DIAGNOSTICS rc = ROW_COUNT;
    IF rc <> 1 THEN
      RAISE EXCEPTION 'CF10_MANAGED_REVISION_TARGET_DRIFT: lesson_explanations'
        USING ERRCODE = '23514';
    END IF;
    domain_writes := domain_writes + rc;
  END IF;$new$;

  old_summary := $old$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_summaries' USING ERRCODE = '23514';
  END IF;$old$;
  new_summary := $new$  ELSIF existing_hash IS DISTINCT FROM new_hash THEN
    IF binding_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: lesson_summaries' USING ERRCODE = '23514';
    END IF;
    UPDATE public.lesson_summaries
       SET summary = payload_text
     WHERE lesson_id = lesson_row.id
       AND public.cf10_text_sha256(summary) =
           (plan #>> ARRAY['managedRevision','targets','lesson_summaries','existingHash']);
    GET DIAGNOSTICS rc = ROW_COUNT;
    IF rc <> 1 THEN
      RAISE EXCEPTION 'CF10_MANAGED_REVISION_TARGET_DRIFT: lesson_summaries'
        USING ERRCODE = '23514';
    END IF;
    domain_writes := domain_writes + rc;
  END IF;$new$;

  occurrences := (length(src) - length(replace(src, old_plan, ''))) / length(old_plan);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_PLAN_PRECONDITION: %', occurrences;
  END IF;
  occurrences := (length(src) - length(replace(src, old_gate, ''))) / length(old_gate);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_GATE_PRECONDITION: %', occurrences;
  END IF;
  occurrences := (length(src) - length(replace(src, old_book, ''))) / length(old_book);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_BOOK_PRECONDITION: %', occurrences;
  END IF;
  occurrences := (length(src) - length(replace(src, old_explanation, ''))) /
    length(old_explanation);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_EXPLANATION_PRECONDITION: %', occurrences;
  END IF;
  occurrences := (length(src) - length(replace(src, old_summary, ''))) / length(old_summary);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_SUMMARY_PRECONDITION: %', occurrences;
  END IF;

  src := replace(src, old_plan, new_plan);
  src := replace(src, old_gate, new_gate);
  src := replace(src, old_book, new_book);
  src := replace(src, old_explanation, new_explanation);
  src := replace(src, old_summary, new_summary);
  EXECUTE src;

  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text =
       'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';

  occurrences := (length(src) - length(replace(src,
    'CF10_MANAGED_REVISION_TARGET_DRIFT', ''))) /
    length('CF10_MANAGED_REVISION_TARGET_DRIFT');
  IF occurrences <> 3 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_POSTVERIFY_TARGETS: %', occurrences;
  END IF;
  IF position('HASH_PINNED_COMPARE_AND_SWAP' in src) = 0 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_POSTVERIFY_PLAN_MISSING';
  END IF;
  IF position('CF10_CONTENT_HASH_CONFLICT: questions' in src) = 0 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_POSTVERIFY_QUESTION_GUARD_LOST';
  END IF;
  IF position('UPDATE public.lesson_capability_lifecycle l' in src) = 0 THEN
    RAISE EXCEPTION 'CF10_MANAGED_REVISION_POSTVERIFY_LIFECYCLE_MISSING';
  END IF;
END
$migration$;

-- Rollback: restore the immediately preceding function definition from the
-- migration backup or repository source. No domain row is written while this
-- migration is applied; replacements happen only inside later CF10 EXECUTEs.

-- ---------------------------------------------------------------------------
-- 3/3 — إعادة الحارس إلى أسطر ELSIF الجديدة
--
-- ضروري: عند payload_text NULL مع وجود صف قائم يصبح new_hash فارغًا، فيتحقّق
-- existing_hash IS DISTINCT FROM new_hash ويحاول التحديث بقيمة فارغة. الحارس
-- يمنع ذلك، فيبقى المكوّن غير المرفوع خارج الدفعة كما هو مقصود.
-- ---------------------------------------------------------------------------
DO $reguard$
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
    RAISE EXCEPTION 'CF10_BACKFILL_REGUARD_FUNCTION_MISSING' USING ERRCODE = 'P0002';
  END IF;
  patched := src;

  a := E'  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\n    IF binding_count IS DISTINCT FROM 1 THEN\n      RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_book_contents'' USING ERRCODE = ''23514'';';
  r := E'  ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash THEN\n    IF binding_count IS DISTINCT FROM 1 THEN\n      RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_book_contents'' USING ERRCODE = ''23514'';';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_REGUARD_ANCHOR: lesson_book_contents matched % times, expected 1', hits
      USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  a := E'  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\n    IF binding_count IS DISTINCT FROM 1 THEN\n      RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_explanations'' USING ERRCODE = ''23514'';';
  r := E'  ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash THEN\n    IF binding_count IS DISTINCT FROM 1 THEN\n      RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_explanations'' USING ERRCODE = ''23514'';';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_REGUARD_ANCHOR: lesson_explanations matched % times, expected 1', hits
      USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  a := E'  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\n    IF binding_count IS DISTINCT FROM 1 THEN\n      RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_summaries'' USING ERRCODE = ''23514'';';
  r := E'  ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash THEN\n    IF binding_count IS DISTINCT FROM 1 THEN\n      RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: lesson_summaries'' USING ERRCODE = ''23514'';';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'CF10_BACKFILL_REGUARD_ANCHOR: lesson_summaries matched % times, expected 1', hits
      USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  EXECUTE patched;
END
$reguard$;

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
