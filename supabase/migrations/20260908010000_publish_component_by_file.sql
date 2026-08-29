-- ============================================================================
-- نشر مكوّن بملفه: يجد الدفعة الجاهزة بنفسه
-- ============================================================================
--
-- العطل: العميل كان يبحث عن الدفعة الجاهزة بربط جدولين لا توجد بينهما علاقة
-- خارجية، فيفشل البحث قبل أن يبدأ:
--   PREPARED_BATCH_LOOKUP_FAILED: Could not find a relationship between
--   'golden_lesson_domain_stage_entries' and 'golden_lesson_identity_bindings'
--
-- الحل: البحث ينتقل إلى قاعدة البيانات حيث يمكن التحقّق منه فعليًا. الدالة تجد
-- أحدث دفعة تحمل هذا الملف بعينه، ومربوطة بالدرس، ومكتوبة في جداول المحتوى،
-- ثم تنشر المكوّن منها.
--
-- «جاهزة» تعني الشروط الثلاثة معًا. الاكتفاء بمطابقة الملف يختار دفعة قديمة غير
-- مُوطَّنة فيفشل النشر — وهذا ما كان سيحدث فعلًا لولا الفحص.
--
-- لا يغيّر golden_lesson_publish_component ولا أي حارس فيها.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.golden_lesson_publish_component_by_file(
  _package_id uuid,
  _capability text,
  _source_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_content_staff(auth.uid()) THEN
    RAISE EXCEPTION 'LCP_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _source_sha256 IS NULL OR _source_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'LCP_SOURCE_SHA_INVALID' USING ERRCODE = '22023';
  END IF;

  -- أحدث دفعة تحمل هذا الملف، ومربوطة، ومُوطَّنة.
  SELECT b.id INTO v_batch_id
    FROM public.golden_lesson_domain_stage_entries e
    JOIN public.golden_lesson_domain_stage_batches b ON b.id = e.batch_id
    JOIN public.golden_lesson_identity_bindings ib   ON ib.batch_id = b.id
   WHERE b.package_id = _package_id
     AND e.capability = _capability
     AND e.source_sha256 = _source_sha256
     AND e.source_path IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.golden_lesson_domain_materializations m
                  WHERE m.batch_id = b.id)
   ORDER BY b.package_version DESC
   LIMIT 1;

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'LCP_NO_PREPARED_BATCH: %', _capability USING ERRCODE = 'P0002';
  END IF;

  RETURN public.golden_lesson_publish_component(
    v_batch_id, _capability, 'by-file:' || _capability || ':' || left(_source_sha256, 16));
END;
$function$;

COMMENT ON FUNCTION public.golden_lesson_publish_component_by_file(uuid, text, text) IS
'Publishes one component from whichever prepared batch already holds that exact file: '
'matched by bytes, bound to the lesson, and already materialised. Never touches the other six.';

REVOKE EXECUTE ON FUNCTION public.golden_lesson_publish_component_by_file(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golden_lesson_publish_component_by_file(uuid, text, text)
  TO authenticated;
