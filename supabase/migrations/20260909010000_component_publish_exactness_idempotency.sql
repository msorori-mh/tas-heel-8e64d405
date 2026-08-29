-- ============================================================================
-- نشر المكوّن: إصدار حالي موثّق + سجل إعادة آمن
-- ============================================================================
--
-- يعالج هذا الترحيل عيبين مستقلين كان اجتماعهما ينتج نجاحًا شكليًا:
--   1) منع عودة manifest سابق للحزمة كان يفشل تسلسل A -> B -> A بقيد UNIQUE.
--   2) مسار by-file كان يعيد نشر دفعة تاريخية بلا إعادة توطين بايتاتها الحالية.
--
-- العقد بعد هذا الترحيل:
--   * التفرد على (package_id, version) فقط؛ تكرار manifest تاريخي إصدار جديد صحيح.
--   * لا توجد دالة تنشر من دفعة تاريخية بالبحث عن الملف.
--   * الطلب المكرر للدفعة/المكوّن نفسه يعيد إيصالًا ثابتًا بلا كتابة ثانية.
--   * إعادة الإيصال تفشل إذا لم تعد READY والبصمة الحية مطابقتين للإيصال.
-- ============================================================================

ALTER TABLE public.golden_lesson_package_versions
  DROP CONSTRAINT IF EXISTS golden_lesson_package_version_package_id_canonical_manifest_key;

CREATE INDEX IF NOT EXISTS golden_lesson_package_versions_manifest_history_idx
  ON public.golden_lesson_package_versions(package_id, canonical_manifest_sha256, version DESC);

-- هذا هو العقد الموجود فعلًا في الإنتاج وتستخدمه سياسات الطالب، لكنه كان قد
-- وصل إلى الإنتاج خارج سجل migrations. تسجيله هنا يجعل إعادة البناء النظيفة
-- مطابقة للإنتاج بدل اعتماد دالة النشر على كائن غير قابل لإعادة الإنشاء.
CREATE OR REPLACE FUNCTION public.lesson_capability_ready(
  _lesson_id uuid,
  _capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN _lesson_id IS NULL OR _capability IS NULL THEN false
    WHEN NOT public.lesson_is_editorially_managed(_lesson_id) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.lesson_capability_lifecycle l
       WHERE l.lesson_id = _lesson_id
         AND l.capability = _capability
         AND l.status = 'READY')
  END;
$function$;

REVOKE ALL ON FUNCTION public.lesson_capability_ready(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_capability_ready(uuid, text)
  TO authenticated, service_role;

-- احتفظ بجسم النشر المثبت كما هو خلف غلاف idempotency صغير وقابل للمراجعة.
ALTER FUNCTION public.golden_lesson_publish_component(uuid, text, text)
  RENAME TO golden_lesson_publish_component_unledgered;

REVOKE ALL ON FUNCTION public.golden_lesson_publish_component_unledgered(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.golden_lesson_component_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL
    REFERENCES public.golden_lesson_domain_stage_batches(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  capability text NOT NULL,
  lifecycle_capability text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 128),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  published_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT golden_lesson_component_publications_batch_capability_key
    UNIQUE (batch_id, capability),
  CONSTRAINT golden_lesson_component_publications_idempotency_key
    UNIQUE (idempotency_key)
);

REVOKE ALL ON public.golden_lesson_component_publications
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.golden_lesson_component_publications TO authenticated, service_role;
ALTER TABLE public.golden_lesson_component_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY golden_lesson_component_publications_staff_read
  ON public.golden_lesson_component_publications
  FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE TRIGGER golden_lesson_component_publications_immutable_row
  BEFORE UPDATE OR DELETE ON public.golden_lesson_component_publications
  FOR EACH ROW EXECUTE FUNCTION public.reject_golden_publication_mutation();

CREATE TRIGGER golden_lesson_component_publications_immutable_truncate
  BEFORE TRUNCATE ON public.golden_lesson_component_publications
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_golden_publication_mutation();

CREATE OR REPLACE FUNCTION public.golden_lesson_publish_component(
  _batch_id uuid,
  _capability text,
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid             uuid := auth.uid();
  entry           public.golden_lesson_domain_stage_entries;
  binding         public.golden_lesson_identity_bindings;
  receipt         public.golden_lesson_component_publications;
  key_receipt     public.golden_lesson_component_publications;
  live_status     text;
  live_ready_hash text;
  clean_key       text := btrim(coalesce(_idempotency_key, ''));
  published       jsonb;
BEGIN
  IF uid IS NULL OR NOT public.is_content_staff(uid) THEN
    RAISE EXCEPTION 'LCP_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF length(clean_key) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'LCP_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- تسلسل متزامن واحد لكل مكوّن في دفعة واحدة. يمنع النقر المزدوج من المرور
  -- إلى الجسم القديم مرتين قبل إنشاء الإيصال.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('lcp:' || _batch_id::text || ':' || coalesce(_capability, ''), 0));

  SELECT * INTO entry
    FROM public.golden_lesson_domain_stage_entries
   WHERE batch_id = _batch_id AND capability = _capability;
  IF entry.id IS NULL OR entry.source_path IS NULL OR entry.source_sha256 IS NULL
     OR entry.source_payload IS NULL THEN
    RAISE EXCEPTION 'LCP_COMPONENT_NOT_IN_BATCH: %', _capability USING ERRCODE = '22023';
  END IF;

  SELECT * INTO binding
    FROM public.golden_lesson_identity_bindings
   WHERE batch_id = _batch_id;
  IF binding.id IS NULL OR binding.lesson_id IS NULL THEN
    RAISE EXCEPTION 'LCP_IDENTITY_BINDING_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO receipt
    FROM public.golden_lesson_component_publications
   WHERE batch_id = _batch_id AND capability = _capability;
  IF receipt.id IS NOT NULL THEN
    IF receipt.idempotency_key IS DISTINCT FROM clean_key THEN
      RAISE EXCEPTION 'LCP_REPLAY_IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF receipt.lesson_id IS DISTINCT FROM binding.lesson_id
       OR receipt.lifecycle_capability IS DISTINCT FROM entry.lifecycle_capability
       OR receipt.source_sha256 IS DISTINCT FROM entry.source_sha256 THEN
      RAISE EXCEPTION 'LCP_REPLAY_SOURCE_CONFLICT' USING ERRCODE = '23505';
    END IF;

    SELECT status, ready_hash INTO live_status, live_ready_hash
      FROM public.lesson_capability_lifecycle
     WHERE lesson_id = receipt.lesson_id
       AND capability = receipt.lifecycle_capability;
    IF live_status IS DISTINCT FROM 'READY'
       OR live_ready_hash IS DISTINCT FROM receipt.source_sha256
       OR NOT public.lesson_capability_ready(receipt.lesson_id, receipt.lifecycle_capability) THEN
      RAISE EXCEPTION 'LCP_REPLAY_LIVE_STATE_CONFLICT' USING ERRCODE = '23505';
    END IF;

    RETURN receipt.result || jsonb_build_object(
      'batch_id', receipt.batch_id,
      'source_sha256', receipt.source_sha256,
      'idempotent_replay', true,
      'writes_performed', 0);
  END IF;

  SELECT * INTO key_receipt
    FROM public.golden_lesson_component_publications
   WHERE idempotency_key = clean_key;
  IF key_receipt.id IS NOT NULL THEN
    RAISE EXCEPTION 'LCP_IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
  END IF;

  published := public.golden_lesson_publish_component_unledgered(
    _batch_id, _capability, clean_key);
  IF coalesce((published->>'student_can_see_this_component')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'LCP_PUBLISHED_BUT_NOT_VISIBLE' USING ERRCODE = '23514';
  END IF;

  published := published || jsonb_build_object(
    'batch_id', _batch_id,
    'source_sha256', entry.source_sha256,
    'idempotent_replay', false);

  INSERT INTO public.golden_lesson_component_publications(
    batch_id, lesson_id, capability, lifecycle_capability, source_sha256,
    idempotency_key, result, published_by)
  VALUES (
    _batch_id, binding.lesson_id, _capability, entry.lifecycle_capability,
    entry.source_sha256, clean_key, published, uid);

  RETURN published;
END;
$function$;

COMMENT ON FUNCTION public.golden_lesson_publish_component(uuid, text, text) IS
'Publishes one freshly materialized component exactly once. Retries replay an immutable '
'receipt only while the live READY hash still equals the staged source hash.';

REVOKE ALL ON FUNCTION public.golden_lesson_publish_component(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.golden_lesson_publish_component(uuid, text, text)
  TO authenticated;

-- لا يبقى أي مدخل قابل للاستدعاء يعيد استخدام دفعة تاريخية بالبحث عن الملف.
DROP FUNCTION IF EXISTS public.golden_lesson_publish_component_by_file(uuid, text, text);

DO $proof$
DECLARE
  d text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.golden_lesson_package_versions'::regclass
       AND conname = 'golden_lesson_package_version_package_id_canonical_manifest_key') THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_GLOBAL_MANIFEST_UNIQUE_STILL_PRESENT';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'golden_lesson_package_versions_manifest_history_idx') THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_MANIFEST_HISTORY_INDEX_MISSING';
  END IF;
  IF to_regprocedure('public.lesson_capability_ready(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_COMPONENT_VISIBILITY_GATE_MISSING';
  END IF;
  IF to_regprocedure('public.golden_lesson_publish_component_by_file(uuid,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_HISTORICAL_ENTRYPOINT_STILL_PRESENT';
  END IF;

  SELECT pg_get_functiondef(
    'public.golden_lesson_publish_component(uuid,text,text)'::regprocedure) INTO d;
  IF position('golden_lesson_component_publications' in d) = 0
     OR position('LCP_REPLAY_LIVE_STATE_CONFLICT' in d) = 0
     OR position('pg_advisory_xact_lock' in d) = 0 THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_IDEMPOTENCY_WRAPPER_INCOMPLETE';
  END IF;
  IF has_function_privilege(
       'anon', 'public.golden_lesson_publish_component(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_GRANTED_TO_ANON';
  END IF;
END
$proof$;

-- Rollback (controlled only): restore the old function name, recreate the historical
-- uniqueness constraint only after proving no duplicate manifests exist, then drop ledger.
