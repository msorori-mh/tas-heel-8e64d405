-- MINISTERIAL_QUESTION_MEDIA_V1
--
-- Images for past ministerial exam questions (Sanaa MCQ + Aden text).
--
--   * Import: package contract v2 = v1 + optional per-question `media[]`
--     (placement QUESTION / OPTION_A..D / SOLUTION). Files are uploaded by
--     content staff to the PRIVATE bucket `question-media` under a
--     content-addressed key BEFORE execute; execute re-validates every item
--     and verifies the storage object exists with matching size + mime in the
--     same transaction (atomic: any missing object rolls the whole import back).
--   * question_media rows are inserted on the revision while it is DRAFT, so
--     the published payload_hash covers them and the frozen-payload trigger
--     keeps them immutable afterwards.
--   * Sessions pin the media list into exam_session_questions.rendered_media at
--     creation time. State exposes non-solution media only; solution media is
--     returned by reveal (training) and result (after completion).
--   * ministerial_media_can_access() is the single gate the authenticated
--     media endpoint asks before minting a short signed URL.
--   * Admin question editing creates a NEW revision (never mutates a published
--     one) and stays blocked while sessions exist.
--
-- PREREQUISITE (runbook): create the private bucket `question-media` before
-- applying this file. Bucket creation is not expressible in SQL on this stack.
-- Backward compatible: v1 packages (no media) keep byte-identical fingerprints.

BEGIN;

-- ============================================================================
-- 1) exam_session_questions.rendered_media
-- ============================================================================
ALTER TABLE public.exam_session_questions
  ADD COLUMN IF NOT EXISTS rendered_media jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.exam_session_questions
  DROP CONSTRAINT IF EXISTS exam_session_questions_rendered_media_is_array;
ALTER TABLE public.exam_session_questions
  ADD CONSTRAINT exam_session_questions_rendered_media_is_array
  CHECK (jsonb_typeof(rendered_media) = 'array') NOT VALID;
ALTER TABLE public.exam_session_questions
  VALIDATE CONSTRAINT exam_session_questions_rendered_media_is_array;
COMMENT ON COLUMN public.exam_session_questions.rendered_media IS
  'Media pinned at session creation: [{media_id, media_code, placement, option_code, alt_text_ar, caption, mime_type, sha256}]. Never contains storage paths.';

-- ============================================================================
-- 2) prepare kinds (v2 = package with media)
-- ============================================================================
ALTER TABLE public.ministerial_import_prepares
  DROP CONSTRAINT IF EXISTS ministerial_import_prepares_kind_check;
ALTER TABLE public.ministerial_import_prepares
  ADD CONSTRAINT ministerial_import_prepares_kind_check
  CHECK (kind IN ('M01', 'M02', 'SANA_PACKAGE_V1', 'ADEN_PACKAGE_V1', 'SANA_PACKAGE_V2', 'ADEN_PACKAGE_V2'));

-- ============================================================================
-- 3) Pure helpers (mirrored by src/lib/ministerial/ministerial-media-contract.ts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ministerial_media_storage_key(_sha256 text, _mime_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(_sha256, ''))) !~ '^[0-9a-f]{64}$' THEN NULL
    WHEN lower(btrim(coalesce(_mime_type, ''))) = 'image/png'
      THEN 'ministerial/' || left(lower(btrim(_sha256)), 2) || '/' || lower(btrim(_sha256)) || '.png'
    WHEN lower(btrim(coalesce(_mime_type, ''))) = 'image/jpeg'
      THEN 'ministerial/' || left(lower(btrim(_sha256)), 2) || '/' || lower(btrim(_sha256)) || '.jpg'
    WHEN lower(btrim(coalesce(_mime_type, ''))) = 'image/webp'
      THEN 'ministerial/' || left(lower(btrim(_sha256)), 2) || '/' || lower(btrim(_sha256)) || '.webp'
    ELSE NULL
  END;
$$;
REVOKE ALL ON FUNCTION public.ministerial_media_storage_key(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ministerial_media_storage_key(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ministerial_media_placement(_media_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _media_code IN ('MEDIA-QUESTION', 'MEDIA-OPTION_A', 'MEDIA-OPTION_B',
                         'MEDIA-OPTION_C', 'MEDIA-OPTION_D', 'MEDIA-SOLUTION')
      THEN substr(_media_code, 7)
    ELSE NULL
  END;
$$;
REVOKE ALL ON FUNCTION public.ministerial_media_placement(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ministerial_media_placement(text) TO authenticated, service_role;

-- Verifies that the uploaded object exists in the private bucket with the
-- declared size and mime type. Dynamic SQL keeps the definition independent of
-- the storage schema at creation time; parameters are bound, never interpolated.
CREATE OR REPLACE FUNCTION public._ministerial_media_object_verified(
  _storage_key text,
  _file_size bigint,
  _mime_type text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE $q$
    SELECT EXISTS (
      SELECT 1
      FROM storage.objects o
      WHERE o.bucket_id = 'question-media'
        AND o.name = $1
        AND coalesce(nullif(o.metadata->>'size', '')::bigint, -1) = $2
        AND lower(coalesce(o.metadata->>'mimetype', '')) = lower($3)
    )
  $q$ INTO v_ok USING _storage_key, _file_size, _mime_type;
  RETURN coalesce(v_ok, false);
END;
$$;
REVOKE ALL ON FUNCTION public._ministerial_media_object_verified(text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ministerial_media_object_verified(text, bigint, text) TO service_role;

-- Normalises + validates a media array for one question. Returns the
-- canonical array (placement, media_code, sort_order, sha256, mime_type,
-- file_size, alt_text_ar, file_name, storage_path). Raises on any violation.
CREATE OR REPLACE FUNCTION public._ministerial_validate_media_array(_media jsonb, _track_code text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_placement text;
  v_sha text;
  v_mime text;
  v_size bigint;
  v_alt text;
  v_name text;
  v_key text;
  v_seen text[] := ARRAY[]::text[];
  v_allowed text[];
BEGIN
  IF _media IS NULL OR jsonb_typeof(_media) = 'null' THEN
    RETURN '[]'::jsonb;
  END IF;
  IF jsonb_typeof(_media) <> 'array' THEN
    RAISE EXCEPTION 'MINISTERIAL_MEDIA_INVALID: media must be an array' USING ERRCODE = '22023';
  END IF;
  v_allowed := CASE lower(coalesce(_track_code, ''))
    WHEN 'sanaa' THEN ARRAY['QUESTION', 'OPTION_A', 'OPTION_B', 'OPTION_C', 'OPTION_D', 'SOLUTION']
    WHEN 'aden' THEN ARRAY['QUESTION', 'SOLUTION']
    ELSE ARRAY[]::text[]
  END;
  IF jsonb_array_length(_media) > coalesce(array_length(v_allowed, 1), 0) THEN
    RAISE EXCEPTION 'MINISTERIAL_MEDIA_TOO_MANY' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_media) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'MINISTERIAL_MEDIA_INVALID: item must be an object' USING ERRCODE = '22023';
    END IF;
    v_placement := upper(btrim(coalesce(v_item->>'placement', '')));
    IF NOT (v_placement = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'MINISTERIAL_MEDIA_PLACEMENT_INVALID: %', v_placement USING ERRCODE = '22023';
    END IF;
    IF v_placement = ANY(v_seen) THEN
      RAISE EXCEPTION 'MINISTERIAL_MEDIA_PLACEMENT_DUPLICATE: %', v_placement USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_placement);

    v_sha := lower(btrim(coalesce(v_item->>'sha256', '')));
    IF v_sha !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'MINISTERIAL_MEDIA_SHA256_INVALID' USING ERRCODE = '22023';
    END IF;
    v_mime := lower(btrim(coalesce(v_item->>'mime_type', '')));
    IF v_mime NOT IN ('image/png', 'image/jpeg', 'image/webp') THEN
      RAISE EXCEPTION 'MINISTERIAL_MEDIA_MIME_INVALID: %', v_mime USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_size := (v_item->>'file_size')::bigint;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'MINISTERIAL_MEDIA_SIZE_INVALID' USING ERRCODE = '22023';
    END;
    IF v_size IS NULL OR v_size < 1 OR v_size > 8388608 THEN
      RAISE EXCEPTION 'MINISTERIAL_MEDIA_SIZE_INVALID: %', v_size USING ERRCODE = '22023';
    END IF;
    v_alt := btrim(coalesce(v_item->>'alt_text_ar', ''));
    IF char_length(v_alt) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'MINISTERIAL_MEDIA_ALT_TEXT_INVALID' USING ERRCODE = '22023';
    END IF;
    v_name := left(btrim(coalesce(v_item->>'file_name', '')), 200);
    v_key := public.ministerial_media_storage_key(v_sha, v_mime);
    IF v_key IS NULL THEN
      RAISE EXCEPTION 'MINISTERIAL_MEDIA_KEY_INVALID' USING ERRCODE = '22023';
    END IF;
    IF nullif(btrim(coalesce(v_item->>'storage_path', '')), '') IS NOT NULL
       AND btrim(v_item->>'storage_path') IS DISTINCT FROM v_key THEN
      RAISE EXCEPTION 'MINISTERIAL_MEDIA_STORAGE_PATH_MISMATCH' USING ERRCODE = '22023';
    END IF;

    v_out := v_out || jsonb_build_object(
      'placement', v_placement,
      'media_code', 'MEDIA-' || v_placement,
      'sort_order', CASE v_placement
        WHEN 'QUESTION' THEN 0 WHEN 'OPTION_A' THEN 1 WHEN 'OPTION_B' THEN 2
        WHEN 'OPTION_C' THEN 3 WHEN 'OPTION_D' THEN 4 ELSE 5 END,
      'sha256', v_sha,
      'mime_type', v_mime,
      'file_size', v_size,
      'alt_text_ar', v_alt,
      'file_name', nullif(v_name, ''),
      'storage_path', v_key
    );
  END LOOP;

  SELECT coalesce(jsonb_agg(value ORDER BY (value->>'sort_order')::int), '[]'::jsonb)
  INTO v_out FROM jsonb_array_elements(v_out);
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public._ministerial_validate_media_array(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ministerial_validate_media_array(jsonb, text) TO service_role;

-- Inserts validated media rows on a DRAFT revision. When _verify_storage is
-- true every object must already exist in the private bucket with the same
-- size and mime type; otherwise the caller's transaction is aborted.
CREATE OR REPLACE FUNCTION public._ministerial_insert_revision_media(
  _revision_id uuid,
  _media jsonb,
  _actor uuid,
  _verify_storage boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_count integer := 0;
  v_status text;
BEGIN
  IF _media IS NULL OR jsonb_typeof(_media) <> 'array' OR jsonb_array_length(_media) = 0 THEN
    RETURN 0;
  END IF;
  SELECT status INTO v_status FROM public.question_revisions WHERE id = _revision_id;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'MINISTERIAL_MEDIA_REVISION_NOT_DRAFT' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_media) LOOP
    IF _verify_storage AND NOT public._ministerial_media_object_verified(
      v_item->>'storage_path', (v_item->>'file_size')::bigint, v_item->>'mime_type'
    ) THEN
      RAISE EXCEPTION 'MINISTERIAL_MEDIA_OBJECT_MISSING: %', v_item->>'storage_path'
        USING ERRCODE = '23514',
              HINT = 'Upload the image to the private question-media bucket before executing the import.';
    END IF;
    INSERT INTO public.question_media(
      question_revision_id, media_code, storage_path, mime_type, file_size, sha256,
      alt_text_ar, caption, sort_order, requires_media, created_by
    ) VALUES (
      _revision_id, v_item->>'media_code', v_item->>'storage_path', v_item->>'mime_type',
      (v_item->>'file_size')::bigint, v_item->>'sha256', v_item->>'alt_text_ar', NULL,
      (v_item->>'sort_order')::int, true, _actor
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.question_revisions SET requires_media = true WHERE id = _revision_id;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public._ministerial_insert_revision_media(uuid, jsonb, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ministerial_insert_revision_media(uuid, jsonb, uuid, boolean) TO service_role;

-- Media list pinned into a session question (no storage paths).
CREATE OR REPLACE FUNCTION public._ministerial_revision_rendered_media(_revision_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'media_id', qm.id,
    'media_code', qm.media_code,
    'placement', public.ministerial_media_placement(qm.media_code),
    'option_code', CASE
      WHEN public.ministerial_media_placement(qm.media_code) LIKE 'OPTION\_%'
        THEN substr(public.ministerial_media_placement(qm.media_code), 8, 1)
      ELSE NULL END,
    'alt_text_ar', qm.alt_text_ar,
    'caption', qm.caption,
    'mime_type', qm.mime_type,
    'sha256', qm.sha256
  ) ORDER BY qm.sort_order, qm.media_code), '[]'::jsonb)
  FROM public.question_media qm
  WHERE qm.question_revision_id = _revision_id
    AND public.ministerial_media_placement(qm.media_code) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public._ministerial_revision_rendered_media(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ministerial_revision_rendered_media(uuid) TO service_role;

-- ============================================================================
-- 4) Private bucket policies: content staff only. No anon path at all.
-- ============================================================================
DO $storage$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects missing — question-media policies skipped (local rehearsal only)';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "question_media_staff_read" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "question_media_staff_insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "question_media_staff_update" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "question_media_admin_delete" ON storage.objects';
  EXECUTE $p$
    CREATE POLICY "question_media_staff_read" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'question-media' AND public.is_content_staff(auth.uid()))
  $p$;
  EXECUTE $p$
    CREATE POLICY "question_media_staff_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'question-media'
        AND public.is_content_staff(auth.uid())
        AND name ~ '^ministerial/[0-9a-f]{2}/[0-9a-f]{64}\.(png|jpg|webp)$'
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY "question_media_staff_update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'question-media' AND public.is_content_staff(auth.uid()))
      WITH CHECK (
        bucket_id = 'question-media'
        AND public.is_content_staff(auth.uid())
        AND name ~ '^ministerial/[0-9a-f]{2}/[0-9a-f]{64}\.(png|jpg|webp)$'
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY "question_media_admin_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'question-media' AND public.is_full_admin(auth.uid()))
  $p$;
END
$storage$;

-- ============================================================================
-- 5) Package prepare (v1 + v2)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ministerial_track_package_prepare(_package jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_contract text := btrim(coalesce(_package->>'contract_version', ''));
  v_track_code text := lower(btrim(coalesce(_package->>'track_code', '')));
  v_subject_code text := lower(btrim(coalesce(_package->>'subject_code', '')));
  v_source_sha text := lower(btrim(coalesce(_package->>'source_sha256', '')));
  v_subject record;
  v_track record;
  v_model jsonb;
  v_question jsonb;
  v_option jsonb;
  v_models jsonb := '[]'::jsonb;
  v_preview jsonb := '[]'::jsonb;
  v_model_code text;
  v_variant text;
  v_model_hash text;
  v_action text;
  v_blocked text;
  v_year integer;
  v_declared integer;
  v_question_count integer;
  v_model_count integer;
  v_total_questions integer := 0;
  v_order integer;
  v_seen_orders integer[];
  v_correct text;
  v_expected_model_answer text;
  v_option_count integer;
  v_marks numeric;
  v_seen_model_codes text[] := ARRAY[]::text[];
  v_prepare_id uuid;
  v_summary jsonb;
  v_prepare_fingerprint text;
  v_existing record;
  v_media jsonb;
  v_media_item jsonb;
  v_media_refs integer := 0;
  v_media_shas text[] := ARRAY[]::text[];
  v_media_bytes bigint := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_package) IS DISTINCT FROM 'object'
     OR v_contract NOT IN ('ministerial_track_package_v1', 'ministerial_track_package_v2') THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_CONTRACT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_track_code NOT IN ('sanaa', 'aden') THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_TRACK_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_source_sha !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_SOURCE_SHA_INVALID' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_package->'models') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODELS_INVALID' USING ERRCODE = '22023';
  END IF;

  v_model_count := jsonb_array_length(_package->'models');
  IF v_model_count NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODEL_COUNT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.code, s.name, s.grade_id, g.slug AS grade_slug, g.name AS grade_name
  INTO v_subject
  FROM public.subjects s
  LEFT JOIN public.grades g ON g.id = s.grade_id
  WHERE lower(s.code) = v_subject_code;
  IF v_subject.id IS NULL THEN
    RAISE EXCEPTION 'SUBJECT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    lower(coalesce(v_subject.grade_slug, '')) IN ('grade-12', 'g12')
    OR lower(v_subject.code) ~ '^sub-g12-[0-9]{3}$'
    OR coalesce(v_subject.grade_name, '') ~ 'الثالث[[:space:]]+الثانوي|الثاني[[:space:]]+عشر'
  ) THEN
    RAISE EXCEPTION 'MINISTERIAL_GRADE_SCOPE_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT id, track_code, track_name, is_active INTO v_track
  FROM public.curriculum_tracks WHERE lower(track_code) = v_track_code;
  IF v_track.id IS NULL THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF v_track.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'TRACK_INACTIVE' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.subject_curriculum_tracks sct
    WHERE sct.subject_id = v_subject.id
      AND sct.curriculum_track_id = v_track.id
      AND sct.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'SUBJECT_TRACK_NOT_ASSIGNED' USING ERRCODE = '22023';
  END IF;

  FOR v_model IN SELECT value FROM jsonb_array_elements(_package->'models') LOOP
    v_blocked := NULL;
    v_action := NULL;
    v_variant := lower(btrim(coalesce(v_model->>'variant_code', '')));
    IF v_variant !~ '^[a-z0-9-]{1,20}$' THEN
      RAISE EXCEPTION 'MINISTERIAL_INVALID_VARIANT_CODE: %', v_variant USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(coalesce(v_model->>'model_label', ''))) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODEL_LABEL_INVALID' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_year := (v_model->>'academic_year')::integer;
      v_declared := (v_model->>'declared_question_count')::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODEL_METADATA_INVALID' USING ERRCODE = '22023';
    END;
    IF v_year NOT BETWEEN 2000 AND 2100 THEN
      RAISE EXCEPTION 'MINISTERIAL_INVALID_YEAR: %', v_year USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_model->'questions') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_QUESTIONS_INVALID' USING ERRCODE = '22023';
    END IF;
    v_question_count := jsonb_array_length(v_model->'questions');
    IF v_question_count NOT BETWEEN 1 AND 500 OR v_question_count <> v_declared THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_QUESTION_COUNT_MISMATCH' USING ERRCODE = '22023';
    END IF;
    v_total_questions := v_total_questions + v_question_count;
    IF v_total_questions > 5000 THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_TOTAL_QUESTIONS_EXCEEDED' USING ERRCODE = '22023';
    END IF;

    v_seen_orders := ARRAY[]::integer[];
    FOR v_question IN SELECT value FROM jsonb_array_elements(v_model->'questions') LOOP
      IF char_length(btrim(coalesce(v_question->>'question_text', ''))) NOT BETWEEN 1 AND 20000 THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_QUESTION_TEXT_INVALID' USING ERRCODE = '22023';
      END IF;
      IF char_length(coalesce(v_question->>'model_answer', '')) > 20000
         OR char_length(coalesce(v_question->>'explanation', '')) > 20000 THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_ANSWER_TEXT_TOO_LONG' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_marks := coalesce((v_question->>'marks')::numeric, 1);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MARKS_INVALID' USING ERRCODE = '22023';
      END;
      IF v_marks <= 0 OR v_marks > 1000 THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MARKS_INVALID' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_order := (v_question->>'display_order')::integer;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_DISPLAY_ORDER_INVALID' USING ERRCODE = '22023';
      END;
      IF v_order <= 0 OR v_order = ANY(v_seen_orders) THEN
        RAISE EXCEPTION 'DUPLICATE_DISPLAY_ORDER: %', v_order USING ERRCODE = '22023';
      END IF;
      v_seen_orders := array_append(v_seen_orders, v_order);

      IF v_track_code = 'sanaa' THEN
        IF jsonb_typeof(v_question->'options') IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'SANA_PACKAGE_OPTIONS_INVALID' USING ERRCODE = '22023';
        END IF;
        v_option_count := jsonb_array_length(v_question->'options');
        v_correct := upper(btrim(coalesce(v_question->>'correct_option_code', '')));
        IF v_option_count <> 4 OR v_correct NOT IN ('A', 'B', 'C', 'D') THEN
          RAISE EXCEPTION 'SANA_PACKAGE_MCQ_CONTRACT_INVALID' USING ERRCODE = '22023';
        END IF;
        IF (SELECT count(DISTINCT upper(value->>'option_code'))
            FROM jsonb_array_elements(v_question->'options')) <> 4 THEN
          RAISE EXCEPTION 'SANA_PACKAGE_OPTION_CODES_INVALID' USING ERRCODE = '22023';
        END IF;
        FOR v_option IN SELECT value FROM jsonb_array_elements(v_question->'options') LOOP
          IF upper(v_option->>'option_code') NOT IN ('A', 'B', 'C', 'D')
             OR char_length(btrim(coalesce(v_option->>'body', ''))) NOT BETWEEN 1 AND 20000 THEN
            RAISE EXCEPTION 'SANA_PACKAGE_OPTION_INVALID' USING ERRCODE = '22023';
          END IF;
        END LOOP;
        SELECT btrim(value->>'body') INTO v_expected_model_answer
        FROM jsonb_array_elements(v_question->'options')
        WHERE upper(value->>'option_code') = v_correct
        LIMIT 1;
        IF btrim(coalesce(v_question->>'model_answer', '')) IS DISTINCT FROM v_expected_model_answer THEN
          RAISE EXCEPTION 'SANA_PACKAGE_MODEL_ANSWER_MISMATCH' USING ERRCODE = '22023';
        END IF;
      ELSE
        IF jsonb_typeof(v_question->'options') IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_question->'options') <> 0
           OR nullif(v_question->>'correct_option_code', '') IS NOT NULL
           OR char_length(btrim(coalesce(v_question->>'model_answer', ''))) NOT BETWEEN 1 AND 20000 THEN
          RAISE EXCEPTION 'ADEN_PACKAGE_TEXT_CONTRACT_INVALID' USING ERRCODE = '22023';
        END IF;
      END IF;

      -- Media (v2 only). Validation is fail-closed; storage existence is
      -- verified at execute time, after the operator uploaded the files.
      v_media := public._ministerial_validate_media_array(v_question->'media', v_track_code);
      IF jsonb_array_length(v_media) > 0 THEN
        IF v_contract <> 'ministerial_track_package_v2' THEN
          RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MEDIA_REQUIRES_V2' USING ERRCODE = '22023';
        END IF;
        FOR v_media_item IN SELECT value FROM jsonb_array_elements(v_media) LOOP
          v_media_refs := v_media_refs + 1;
          IF NOT ((v_media_item->>'sha256') = ANY(v_media_shas)) THEN
            v_media_shas := array_append(v_media_shas, v_media_item->>'sha256');
            v_media_bytes := v_media_bytes + (v_media_item->>'file_size')::bigint;
            IF v_media_bytes > 52428800 THEN
              RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MEDIA_TOTAL_TOO_LARGE' USING ERRCODE = '22023';
            END IF;
          END IF;
        END LOOP;
      ELSIF v_question ? 'media' AND jsonb_typeof(v_question->'media') = 'array'
            AND jsonb_array_length(v_question->'media') = 0 THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MEDIA_EMPTY_ARRAY' USING ERRCODE = '22023';
      END IF;
    END LOOP;

    v_model_code := public.ministerial_build_model_code(
      v_subject.code, v_track_code, v_year, 'r1', v_variant
    );
    IF v_model_code = ANY(v_seen_model_codes) THEN
      RAISE EXCEPTION 'DUPLICATE_MODEL_IDENTITY_IN_PACKAGE: %', v_model_code USING ERRCODE = '22023';
    END IF;
    v_seen_model_codes := array_append(v_seen_model_codes, v_model_code);
    v_model_hash := public.cf10_text_sha256(jsonb_build_object(
      'contract_version', v_contract,
      'track_code', v_track_code,
      'subject_code', lower(v_subject.code),
      'academic_year', v_year,
      'variant_code', v_variant,
      'model_label', btrim(v_model->>'model_label'),
      'questions', v_model->'questions'
    )::text);

    SELECT id, status, source_fingerprint, import_contract
    INTO v_existing
    FROM public.ministerial_exam_models
    WHERE model_code = v_model_code;
    IF v_existing.id IS NULL THEN
      v_action := 'INSERT';
    ELSIF v_existing.status = 'draft'
          AND v_existing.import_contract = v_contract
          AND v_existing.source_fingerprint = v_model_hash THEN
      v_action := 'SKIP';
    ELSIF v_existing.status <> 'draft' THEN
      v_blocked := 'MODEL_IDENTITY_IMMUTABLE';
    ELSE
      v_blocked := 'MODEL_CONTENT_CONFLICT';
    END IF;

    v_models := v_models || jsonb_build_object(
      'model_code', v_model_code,
      'model_label', btrim(v_model->>'model_label'),
      'academic_year', v_year,
      'variant_code', v_variant,
      'worksheet_name', v_model->>'worksheet_name',
      'model_fingerprint', v_model_hash,
      'questions', v_model->'questions',
      'action', coalesce(v_action, 'BLOCKED'),
      'blocked_reason', v_blocked
    );
    v_preview := v_preview || jsonb_build_object(
      'model_code', v_model_code,
      'model_label', btrim(v_model->>'model_label'),
      'academic_year', v_year,
      'track_code', v_track_code,
      'question_count', v_question_count,
      'fingerprint', v_model_hash,
      'action', coalesce(v_action, 'BLOCKED'),
      'blocked_reason', v_blocked
    );
  END LOOP;

  v_summary := jsonb_build_object(
    'models', v_model_count,
    'questions', v_total_questions,
    'insert', (SELECT count(*) FROM jsonb_array_elements(v_models) r WHERE r->>'action' = 'INSERT'),
    'skip', (SELECT count(*) FROM jsonb_array_elements(v_models) r WHERE r->>'action' = 'SKIP'),
    'blocked', (SELECT count(*) FROM jsonb_array_elements(v_models) r WHERE r->>'action' = 'BLOCKED'),
    'media_refs', v_media_refs,
    'media_files', coalesce(array_length(v_media_shas, 1), 0),
    'media_bytes', v_media_bytes
  );
  v_prepare_fingerprint := public.cf10_text_sha256(v_models::text);

  INSERT INTO public.ministerial_import_prepares(kind, actor_id, fingerprint, staged_rows, summary)
  VALUES (
    CASE v_track_code WHEN 'sanaa' THEN 'SANA_PACKAGE' ELSE 'ADEN_PACKAGE' END
      || CASE v_contract WHEN 'ministerial_track_package_v2' THEN '_V2' ELSE '_V1' END,
    v_actor,
    v_prepare_fingerprint,
    v_models,
    v_summary || jsonb_build_object(
      'contract_version', v_contract,
      'track_code', v_track_code,
      'subject_id', v_subject.id,
      'subject_code', v_subject.code,
      'source_sha256', v_source_sha
    )
  )
  RETURNING id INTO v_prepare_id;

  RETURN jsonb_build_object(
    'prepare_id', v_prepare_id,
    'prepare_fingerprint', v_prepare_fingerprint,
    'summary', v_summary,
    'preview', v_preview,
    'expires_in_minutes', 60
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ministerial_track_package_prepare(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ministerial_track_package_prepare(jsonb) TO authenticated;

-- ============================================================================
-- 6) Package execute (media rows + storage verification, still atomic)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ministerial_track_package_execute(
  _prepare_id uuid,
  _expected_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_contract text;
  v_prepare public.ministerial_import_prepares;
  v_track_code text;
  v_subject_id uuid;
  v_subject record;
  v_track_id uuid;
  v_model jsonb;
  v_question jsonb;
  v_option jsonb;
  v_template_id uuid;
  v_model_id uuid;
  v_question_id uuid;
  v_revision_id uuid;
  v_model_code text;
  v_question_code text;
  v_question_number integer;
  v_start_number integer;
  v_attempts integer;
  v_legacy_options jsonb;
  v_correct_index integer;
  v_option_index integer;
  v_inserted_models integer := 0;
  v_inserted_questions integer := 0;
  v_skipped_models integer := 0;
  v_inserted_media integer := 0;
  v_model_media integer;
  v_media jsonb;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prepare
  FROM public.ministerial_import_prepares
  WHERE id = _prepare_id
    AND actor_id = v_actor
    AND kind IN ('SANA_PACKAGE_V1', 'ADEN_PACKAGE_V1', 'SANA_PACKAGE_V2', 'ADEN_PACKAGE_V2')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MINISTERIAL_PREPARE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF btrim(coalesce(_expected_fingerprint, '')) IS DISTINCT FROM v_prepare.fingerprint
     OR public.cf10_text_sha256(v_prepare.staged_rows::text) IS DISTINCT FROM v_prepare.fingerprint THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_FINGERPRINT_MISMATCH' USING ERRCODE = '40001';
  END IF;
  IF v_prepare.status = 'consumed' THEN
    v_result := v_prepare.summary->'execution_result';
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'MINISTERIAL_PREPARE_RESULT_MISSING' USING ERRCODE = '40001';
    END IF;
    RETURN v_result;
  END IF;
  IF v_prepare.status <> 'pending' THEN
    RAISE EXCEPTION 'MINISTERIAL_PREPARE_STATE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_prepare.expires_at < now() THEN
    RAISE EXCEPTION 'MINISTERIAL_PREPARE_EXPIRED' USING ERRCODE = '22023';
  END IF;
  IF coalesce((v_prepare.summary->>'blocked')::integer, 0) <> 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_HAS_BLOCKED_MODELS' USING ERRCODE = '22023';
  END IF;

  v_contract := v_prepare.summary->>'contract_version';
  IF v_contract NOT IN ('ministerial_track_package_v1', 'ministerial_track_package_v2') THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_CONTRACT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_track_code := v_prepare.summary->>'track_code';
  v_subject_id := (v_prepare.summary->>'subject_id')::uuid;
  SELECT id, code, name INTO v_subject FROM public.subjects WHERE id = v_subject_id;
  SELECT id INTO v_track_id FROM public.curriculum_tracks
  WHERE track_code = v_track_code AND is_active IS TRUE;
  IF v_subject.id IS NULL OR v_track_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.subject_curriculum_tracks
    WHERE subject_id = v_subject_id AND curriculum_track_id = v_track_id AND is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_CONTEXT_DRIFT' USING ERRCODE = '40001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_subject.code || ':' || v_track_code, 0));

  FOR v_model IN SELECT value FROM jsonb_array_elements(v_prepare.staged_rows) LOOP
    v_model_code := v_model->>'model_code';
    v_model_media := 0;
    IF v_model->>'action' = 'SKIP' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.ministerial_exam_models m
        WHERE m.model_code = v_model_code
          AND m.status = 'draft'
          AND m.import_contract = v_contract
          AND m.source_fingerprint = v_model->>'model_fingerprint'
      ) THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODEL_DRIFT: %', v_model_code USING ERRCODE = '40001';
      END IF;
      v_skipped_models := v_skipped_models + 1;
      CONTINUE;
    END IF;
    IF v_model->>'action' <> 'INSERT' OR EXISTS (
      SELECT 1 FROM public.ministerial_exam_models WHERE model_code = v_model_code
    ) THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODEL_DRIFT: %', v_model_code USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.exam_templates(title, mode, subject_id, is_active, code, created_by)
    VALUES (
      v_model->>'model_label', 'ministry', v_subject_id, true, v_model_code, v_actor
    ) RETURNING id INTO v_template_id;

    INSERT INTO public.ministerial_exam_models(
      template_id, subject_id, curriculum_track_id, academic_year, round_code,
      variant_code, model_code, model_label, status, created_by,
      import_contract, source_fingerprint
    ) VALUES (
      v_template_id, v_subject_id, v_track_id, (v_model->>'academic_year')::integer, 'r1',
      v_model->>'variant_code', v_model_code, v_model->>'model_label', 'draft', v_actor,
      v_contract, v_model->>'model_fingerprint'
    ) RETURNING id INTO v_model_id;

    FOR v_question IN
      SELECT value FROM jsonb_array_elements(v_model->'questions')
      ORDER BY (value->>'display_order')::integer
    LOOP
      v_start_number := 1 + (
        (hashtextextended(v_model_code || ':' || (v_question->>'display_order'), 0)
          & 9223372036854775807) % 99999
      )::integer;
      v_question_number := v_start_number;
      v_attempts := 0;
      LOOP
        v_question_code := format(
          'q-%s-%s-%s', split_part(v_subject.code, '-', 2), split_part(v_subject.code, '-', 3),
          lpad(v_question_number::text, 5, '0')
        );
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.questions WHERE code = v_question_code);
        v_question_number := CASE WHEN v_question_number = 99999 THEN 1 ELSE v_question_number + 1 END;
        v_attempts := v_attempts + 1;
        IF v_attempts >= 99999 THEN
          RAISE EXCEPTION 'MINISTERIAL_QUESTION_CODE_SPACE_EXHAUSTED' USING ERRCODE = '54000';
        END IF;
      END LOOP;

      SELECT coalesce(jsonb_agg(value->>'body' ORDER BY value->>'option_code'), '[]'::jsonb)
      INTO v_legacy_options
      FROM jsonb_array_elements(v_question->'options');
      v_correct_index := CASE upper(coalesce(v_question->>'correct_option_code', ''))
        WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 2 WHEN 'D' THEN 3 ELSE -1 END;

      -- Re-validate media from the staged rows (never trust the prepare blindly).
      v_media := public._ministerial_validate_media_array(v_question->'media', v_track_code);
      IF jsonb_array_length(v_media) > 0 AND v_contract <> 'ministerial_track_package_v2' THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MEDIA_REQUIRES_V2' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.questions(
        subject_id, question_text, options, correct_index, question_type,
        year, sort_order, code, created_by
      ) VALUES (
        v_subject_id, v_question->>'question_text', v_legacy_options, v_correct_index,
        CASE v_track_code WHEN 'sanaa' THEN 'MULTIPLE_CHOICE' ELSE 'EXTENDED_RESPONSE' END,
        (v_model->>'academic_year')::integer, (v_question->>'display_order')::integer,
        v_question_code, v_actor
      ) RETURNING id INTO v_question_id;

      INSERT INTO public.question_revisions(
        question_id, revision_number, status, interaction_type, grading_mode,
        educational_label, question_text, max_score, allow_partial, requires_media,
        manual_grading_required, payload_hash_version, source_payload_hash, created_by
      ) VALUES (
        v_question_id, 1, 'DRAFT',
        CASE v_track_code WHEN 'sanaa' THEN 'SINGLE_CHOICE' ELSE 'LONG_TEXT' END,
        CASE v_track_code WHEN 'sanaa' THEN 'AUTO_SINGLE' ELSE 'MANUAL' END,
        'MINISTERIAL_PREVIOUS_EXAM', v_question->>'question_text',
        coalesce((v_question->>'marks')::numeric, 1), false, false,
        v_track_code = 'aden', 'canonical_payload_v1',
        public.cf10_text_sha256(v_question::text), v_actor
      ) RETURNING id INTO v_revision_id;

      v_option_index := 0;
      FOR v_option IN
        SELECT value FROM jsonb_array_elements(v_question->'options')
        ORDER BY value->>'option_code'
      LOOP
        INSERT INTO public.question_options(
          question_revision_id, option_code, body, sort_order, is_correct
        ) VALUES (
          v_revision_id, upper(v_option->>'option_code'), v_option->>'body', v_option_index,
          upper(v_option->>'option_code') = upper(v_question->>'correct_option_code')
        );
        v_option_index := v_option_index + 1;
      END LOOP;

      INSERT INTO public.question_solutions(
        question_revision_id, solution_code, solution_type, sort_order,
        model_answer, explanation, reveal_policy, created_by
      ) VALUES (
        v_revision_id, 'MODEL', 'MODEL', 0,
        nullif(v_question->>'model_answer', ''), nullif(v_question->>'explanation', ''),
        'AFTER_SUBMIT', v_actor
      );
      INSERT INTO public.question_targets(
        question_id, revision_id, target_type, subject_id, is_primary, created_by
      ) VALUES (v_question_id, v_revision_id, 'SUBJECT', v_subject_id, true, v_actor);

      -- Media rows land while the revision is DRAFT and are verified against
      -- the private bucket. A missing/mismatched object aborts the import.
      v_model_media := v_model_media
        + public._ministerial_insert_revision_media(v_revision_id, v_media, v_actor, true);

      UPDATE public.question_revisions
      SET payload_hash = public._qb_compute_revision_payload_hash(v_revision_id)
      WHERE id = v_revision_id;
      UPDATE public.question_revisions
      SET status = 'APPROVED', reviewed_at = now(), reviewed_by = v_actor
      WHERE id = v_revision_id;
      UPDATE public.question_revisions
      SET status = 'PUBLISHED', published_at = now(), published_by = v_actor
      WHERE id = v_revision_id;
      UPDATE public.questions
      SET current_published_revision_id = v_revision_id
      WHERE id = v_question_id;

      INSERT INTO public.ministerial_exam_questions(
        model_id, question_id, published_revision_id, source_question_code,
        sort_order, marks, original_question_number, source_reference
      ) VALUES (
        v_model_id, v_question_id, v_revision_id, v_question_code,
        (v_question->>'display_order')::integer, coalesce((v_question->>'marks')::numeric, 1),
        (v_question->>'display_order')::integer,
        'track-package:' || left(v_prepare.summary->>'source_sha256', 16)
      );
      INSERT INTO public.exam_template_questions(template_id, question_id, sort_order, points)
      VALUES (
        v_template_id, v_question_id, (v_question->>'display_order')::integer,
        coalesce((v_question->>'marks')::numeric, 1)
      );
      v_inserted_questions := v_inserted_questions + 1;
    END LOOP;

    IF NOT public.can_publish_ministerial_model(v_model_id) THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_PUBLISH_READINESS_FAILED: %', v_model_code
        USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (
      v_actor, 'ministerial_track_package_import', 'ministerial_exam_model', v_model_id,
      jsonb_build_object(
        'contract_version', v_contract,
        'track_code', v_track_code,
        'model_code', v_model_code,
        'model_fingerprint', v_model->>'model_fingerprint',
        'question_count', jsonb_array_length(v_model->'questions'),
        'media_count', v_model_media,
        'prepare_id', _prepare_id
      )
    );
    v_inserted_models := v_inserted_models + 1;
    v_inserted_media := v_inserted_media + v_model_media;
  END LOOP;

  v_result := jsonb_build_object(
    'inserted_models', v_inserted_models,
    'inserted_questions', v_inserted_questions,
    'inserted_media', v_inserted_media,
    'skipped_models', v_skipped_models,
    'published_models', 0,
    'status', 'draft'
  );
  UPDATE public.ministerial_import_prepares
  SET status = 'consumed',
      consumed_at = now(),
      summary = summary || jsonb_build_object('execution_result', v_result)
  WHERE id = _prepare_id;

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (
    v_actor, 'ministerial_track_package_execute', 'ministerial_import_prepare', _prepare_id,
    v_result || jsonb_build_object('prepare_fingerprint', v_prepare.fingerprint)
  );
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.ministerial_track_package_execute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ministerial_track_package_execute(uuid, text) TO authenticated;

-- ============================================================================
-- 7) Session creation pins media
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_ministerial_exam_session(
  _model_id uuid,
  _mode text DEFAULT 'training'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_model public.ministerial_exam_models;
  v_tpl public.exam_templates;
  v_session_id uuid;
  v_total_q integer := 0;
  v_total_pts numeric := 0;
  v_expires timestamptz;
  v_membership record;
  v_option record;
  v_rendered_options jsonb;
  v_option_mapping jsonb;
  v_display_index integer;
  v_question_order integer := 0;
  v_esq_id uuid;
  v_mode text := lower(coalesce(_mode, 'training'));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF v_mode NOT IN ('training', 'strict') THEN
    RAISE EXCEPTION 'INVALID_ATTEMPT_MODE' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id = _model_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_model.status <> 'published' THEN
    RAISE EXCEPTION 'MINISTERIAL_MODEL_NOT_PUBLISHED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tpl FROM public.exam_templates WHERE id = v_model.template_id;
  IF NOT FOUND OR v_tpl.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'template_inactive' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_ministerial_model(_model_id) THEN
    RAISE EXCEPTION 'curriculum_or_grade_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(marks), 0)
  INTO v_total_q, v_total_pts
  FROM public.ministerial_exam_questions
  WHERE model_id = _model_id;

  IF v_total_q = 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_MODEL_HAS_NO_QUESTIONS' USING ERRCODE = '22023';
  END IF;

  IF v_mode = 'strict' THEN
    v_expires := now() + make_interval(
      secs => COALESCE(v_tpl.duration_seconds, GREATEST(5, v_total_q) * 60)
    );
  END IF;

  INSERT INTO public.exam_sessions (
    user_id, template_id, mode, status, expires_at, total_questions, total_points,
    attempt_pin_mode, grading_status, ministerial_model_id, ministerial_attempt_mode,
    correct_answers, is_final
  )
  VALUES (
    v_user, v_model.template_id, 'ministry', 'in_progress', v_expires, v_total_q, v_total_pts,
    'REVISION_PINNED', 'IN_PROGRESS', _model_id, v_mode,
    NULL, false
  )
  RETURNING id INTO v_session_id;

  FOR v_membership IN
    SELECT meq.*, qr.question_text, qr.stimulus_text, qr.payload_hash,
           q.id AS logical_question_id
    FROM public.ministerial_exam_questions meq
    JOIN public.question_revisions qr ON qr.id = meq.published_revision_id
    JOIN public.questions q ON q.id = meq.question_id
    WHERE meq.model_id = _model_id
    ORDER BY meq.sort_order
  LOOP
    v_question_order := v_question_order + 1;
    v_rendered_options := '[]'::jsonb;
    v_option_mapping := '[]'::jsonb;
    v_display_index := 0;

    FOR v_option IN
      SELECT id, option_code, body, sort_order
      FROM public.question_options
      WHERE question_revision_id = v_membership.published_revision_id
      ORDER BY sort_order
    LOOP
      v_rendered_options := v_rendered_options || jsonb_build_object(
        'option_code', v_option.option_code,
        'body', v_option.body
      );
      v_option_mapping := v_option_mapping || jsonb_build_object(
        'display_index', v_display_index,
        'original_index', v_option.sort_order,
        'option_code', v_option.option_code
      );
      v_display_index := v_display_index + 1;
    END LOOP;

    INSERT INTO public.exam_session_questions (
      exam_session_id, question_revision_id, logical_question_id, question_order,
      rendered_question_text, rendered_stimulus_text, rendered_options, option_order_mapping,
      max_score, payload_hash, payload_hash_version, pin_mode, rendered_media
    )
    VALUES (
      v_session_id, v_membership.published_revision_id, v_membership.logical_question_id,
      v_question_order, v_membership.question_text, v_membership.stimulus_text,
      v_rendered_options, v_option_mapping,
      v_membership.marks, v_membership.payload_hash, 'canonical_payload_v1', 'REVISION_PINNED',
      public._ministerial_revision_rendered_media(v_membership.published_revision_id)
    )
    RETURNING id INTO v_esq_id;

    INSERT INTO public.exam_session_answers (
      session_id, question_id, exam_session_question_id, question_revision_id,
      max_score, pin_mode, grading_status
    )
    VALUES (
      v_session_id, v_membership.logical_question_id, v_esq_id,
      v_membership.published_revision_id, v_membership.marks, 'REVISION_PINNED', 'NOT_REQUIRED'
    );
  END LOOP;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ministerial_exam_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ministerial_exam_session(uuid, text) TO authenticated;

-- ============================================================================
-- 8) Session state: non-solution media only
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_ministerial_session_state(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_questions jsonb;
  v_answers jsonb;
  v_model jsonb;
BEGIN
  v_session := public._ministerial_session_guard(_session_id);

  SELECT jsonb_build_object(
    'model_id', m.id,
    'model_code', m.model_code,
    'model_label', m.model_label,
    'academic_year', m.academic_year,
    'round_code', m.round_code::text,
    'subject_id', s.id,
    'subject_name', s.name,
    'track_code', ct.track_code,
    'track_name', ct.track_name
  ) INTO v_model
  FROM public.ministerial_exam_models m
  JOIN public.subjects s ON s.id = m.subject_id
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  WHERE m.id = v_session.ministerial_model_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'session_question_id', esq.id,
    'question_id', esq.logical_question_id,
    'question_order', esq.question_order,
    'question_text', esq.rendered_question_text,
    'stimulus_text', esq.rendered_stimulus_text,
    'options', esq.rendered_options,
    'max_score', esq.max_score,
    'media', (
      SELECT coalesce(jsonb_agg(m), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(esq.rendered_media, '[]'::jsonb)) m
      WHERE m->>'placement' <> 'SOLUTION'
    )
  ) ORDER BY esq.question_order), '[]'::jsonb)
  INTO v_questions
  FROM public.exam_session_questions esq
  WHERE esq.exam_session_id = _session_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'question_id', a.question_id,
    'session_question_id', a.exam_session_question_id,
    'selected_option_code', a.selected_option_code,
    'response_text', a.response_text,
    'answered_at', a.answered_at,
    'revealed_at', a.revealed_at
  )), '[]'::jsonb)
  INTO v_answers
  FROM public.exam_session_answers a
  WHERE a.session_id = _session_id;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status::text,
      'mode', v_session.mode::text,
      'attempt_mode', coalesce(v_session.ministerial_attempt_mode, 'training'),
      'grading_status', v_session.grading_status,
      'is_final', v_session.is_final,
      'started_at', v_session.started_at,
      'expires_at', v_session.expires_at,
      'server_now', now(),
      'total_questions', v_session.total_questions
    ),
    'model', v_model,
    'questions', v_questions,
    'answers', v_answers,
    'reveal', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ministerial_session_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ministerial_session_state(uuid) TO authenticated;

-- ============================================================================
-- 9) Training reveal: solution media only when the solution itself is revealed
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reveal_ministerial_training_answer(
  _session_id uuid,
  _session_question_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_esq public.exam_session_questions;
  v_answer public.exam_session_answers;
  v_track_code text;
  v_correct boolean;
  v_correct_code text;
  v_explanation text;
  v_model_answer text;
  v_lesson_id uuid;
  v_lesson_title text;
  v_solution_media jsonb;
BEGIN
  v_session := public._ministerial_session_guard(_session_id);
  IF coalesce(v_session.ministerial_attempt_mode, 'strict') <> 'training' THEN
    RAISE EXCEPTION 'REVEAL_NOT_ALLOWED_IN_STRICT' USING ERRCODE = '42501';
  END IF;

  SELECT ct.track_code INTO v_track_code
  FROM public.ministerial_exam_models m
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  WHERE m.id = v_session.ministerial_model_id;

  SELECT * INTO v_esq
  FROM public.exam_session_questions
  WHERE id = _session_question_id AND exam_session_id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_in_session' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_answer
  FROM public.exam_session_answers
  WHERE session_id = _session_id AND exam_session_question_id = _session_question_id
  FOR UPDATE;
  IF NOT FOUND OR v_answer.answered_at IS NULL THEN
    RAISE EXCEPTION 'ANSWER_REQUIRED_BEFORE_REVEAL' USING ERRCODE = '42501';
  END IF;

  SELECT qs.explanation, qs.model_answer
  INTO v_explanation, v_model_answer
  FROM public.question_solutions qs
  WHERE qs.question_revision_id = v_esq.question_revision_id
    AND lower(coalesce(qs.reveal_policy, 'after_submit')) NOT IN ('hidden', 'staff_only')
  ORDER BY qs.sort_order NULLS LAST
  LIMIT 1;

  SELECT coalesce(jsonb_agg(m), '[]'::jsonb) INTO v_solution_media
  FROM jsonb_array_elements(coalesce(v_esq.rendered_media, '[]'::jsonb)) m
  WHERE m->>'placement' = 'SOLUTION';

  IF v_track_code = 'aden' THEN
    IF nullif(btrim(coalesce(v_answer.response_text, '')), '') IS NULL THEN
      RAISE EXCEPTION 'ANSWER_REQUIRED_BEFORE_REVEAL' USING ERRCODE = '42501';
    END IF;
    IF nullif(btrim(coalesce(v_model_answer, '')), '') IS NULL THEN
      RAISE EXCEPTION 'MINISTERIAL_ANSWER_LAYER_NOT_READY' USING ERRCODE = '23514';
    END IF;
    UPDATE public.exam_session_answers
    SET revealed_at = coalesce(revealed_at, now()),
        requires_manual_review = true,
        grading_status = 'PENDING_MANUAL_REVIEW',
        updated_at = now()
    WHERE id = v_answer.id;
    RETURN jsonb_build_object(
      'verdict', 'manual_review',
      'correct_option_code', NULL,
      'model_answer', v_model_answer,
      'explanation', v_explanation,
      'solution_media', v_solution_media,
      'comparison_only', true
    );
  END IF;

  v_correct := public._ministerial_is_correct(v_esq.id, v_answer.selected_option_code);
  IF v_correct IS NULL THEN
    UPDATE public.exam_session_answers
    SET revealed_at = coalesce(revealed_at, now()),
        requires_manual_review = true,
        grading_status = 'PENDING_MANUAL_REVIEW',
        updated_at = now()
    WHERE id = v_answer.id;
    RETURN jsonb_build_object(
      'verdict', 'manual_review',
      'correct_option_code', NULL,
      'explanation', NULL,
      'solution_media', '[]'::jsonb
    );
  END IF;

  SELECT option_code INTO v_correct_code
  FROM public.question_options
  WHERE question_revision_id = v_esq.question_revision_id AND is_correct IS TRUE
  ORDER BY sort_order LIMIT 1;
  SELECT l.id, l.title INTO v_lesson_id, v_lesson_title
  FROM public.question_targets qt
  JOIN public.lessons l ON l.id = qt.lesson_id
  WHERE qt.revision_id = v_esq.question_revision_id AND qt.lesson_id IS NOT NULL
  ORDER BY qt.is_primary DESC NULLS LAST LIMIT 1;

  UPDATE public.exam_session_answers
  SET revealed_at = coalesce(revealed_at, now()),
      is_correct = v_correct,
      auto_score = CASE WHEN v_correct THEN coalesce(v_answer.max_score, 0) ELSE 0 END,
      grading_status = 'GRADED',
      updated_at = now()
  WHERE id = v_answer.id;

  RETURN jsonb_build_object(
    'verdict', CASE WHEN v_correct THEN 'correct' ELSE 'wrong' END,
    'correct_option_code', v_correct_code,
    'explanation', v_explanation,
    'model_answer', v_model_answer,
    'solution_media', v_solution_media,
    'lesson_id', v_lesson_id,
    'lesson_title', v_lesson_title,
    'comparison_only', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reveal_ministerial_training_answer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_ministerial_training_answer(uuid, uuid) TO authenticated;

-- ============================================================================
-- 10) Result: question media + solution media (session already completed)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_ministerial_session_result(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_model jsonb;
  v_questions jsonb;
BEGIN
  v_session := public._ministerial_session_guard(_session_id);
  IF v_session.status = 'in_progress' OR v_session.result_json IS NULL THEN
    RAISE EXCEPTION 'SESSION_NOT_COMPLETED' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'model_id', m.id,
    'model_code', m.model_code,
    'model_label', m.model_label,
    'academic_year', m.academic_year,
    'round_code', m.round_code::text,
    'subject_id', m.subject_id,
    'subject_name', s.name,
    'track_code', ct.track_code,
    'track_name', ct.track_name
  ) INTO v_model
  FROM public.ministerial_exam_models m
  JOIN public.subjects s ON s.id = m.subject_id
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  WHERE m.id = v_session.ministerial_model_id;

  SELECT coalesce(jsonb_agg(q ORDER BY (q->>'question_order')::int), '[]'::jsonb)
  INTO v_questions
  FROM (
    SELECT jsonb_build_object(
      'session_question_id', esq.id,
      'question_order', esq.question_order,
      'question_text', esq.rendered_question_text,
      'stimulus_text', esq.rendered_stimulus_text,
      'options', esq.rendered_options,
      'max_score', esq.max_score,
      'selected_option_code', esa.selected_option_code,
      'response_text', esa.response_text,
      'status', CASE
        WHEN esa.requires_manual_review IS TRUE THEN 'manual_review'
        WHEN esa.answered_at IS NULL THEN 'blank'
        WHEN esa.is_correct IS TRUE THEN 'correct'
        WHEN esa.is_correct IS FALSE THEN 'wrong'
        ELSE 'manual_review'
      END,
      'correct_option_code', CASE WHEN esa.requires_manual_review IS TRUE THEN NULL ELSE (
        SELECT qo.option_code FROM public.question_options qo
        WHERE qo.question_revision_id = esq.question_revision_id AND qo.is_correct IS TRUE
        ORDER BY qo.sort_order LIMIT 1
      ) END,
      'model_answer', (
        SELECT qs.model_answer FROM public.question_solutions qs
        WHERE qs.question_revision_id = esq.question_revision_id
          AND lower(coalesce(qs.reveal_policy, 'after_submit')) NOT IN ('hidden', 'staff_only')
        ORDER BY qs.sort_order NULLS LAST LIMIT 1
      ),
      'explanation', (
        SELECT qs.explanation FROM public.question_solutions qs
        WHERE qs.question_revision_id = esq.question_revision_id
          AND lower(coalesce(qs.reveal_policy, 'after_submit')) NOT IN ('hidden', 'staff_only')
        ORDER BY qs.sort_order NULLS LAST LIMIT 1
      ),
      'lesson_id', (
        SELECT qt.lesson_id FROM public.question_targets qt
        WHERE qt.revision_id = esq.question_revision_id AND qt.lesson_id IS NOT NULL
        ORDER BY qt.is_primary DESC NULLS LAST LIMIT 1
      ),
      'media', (
        SELECT coalesce(jsonb_agg(m), '[]'::jsonb)
        FROM jsonb_array_elements(coalesce(esq.rendered_media, '[]'::jsonb)) m
        WHERE m->>'placement' <> 'SOLUTION'
      ),
      'solution_media', (
        SELECT coalesce(jsonb_agg(m), '[]'::jsonb)
        FROM jsonb_array_elements(coalesce(esq.rendered_media, '[]'::jsonb)) m
        WHERE m->>'placement' = 'SOLUTION'
      )
    ) AS q
    FROM public.exam_session_questions esq
    JOIN public.exam_session_answers esa ON esa.exam_session_question_id = esq.id
    WHERE esq.exam_session_id = _session_id
  ) t;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status::text,
      'attempt_mode', v_session.ministerial_attempt_mode,
      'grading_status', v_session.grading_status,
      'is_final', v_session.is_final,
      'started_at', v_session.started_at,
      'completed_at', v_session.completed_at
    ),
    'model', v_model,
    'summary', v_session.result_json,
    'questions', v_questions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ministerial_session_result(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ministerial_session_result(uuid) TO authenticated;

-- ============================================================================
-- 11) Media access gate (used by the authenticated media endpoint)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ministerial_media_can_access(
  _media_id uuid,
  _session_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session public.exam_sessions;
  v_esq_id uuid;
  v_placement text;
BEGIN
  IF v_user IS NULL OR _media_id IS NULL THEN
    RETURN false;
  END IF;

  -- Content staff preview any ministerial media (admin question management).
  IF public.is_content_staff(v_user) THEN
    RETURN EXISTS (
      SELECT 1 FROM public.question_media qm
      WHERE qm.id = _media_id
        AND public.ministerial_media_placement(qm.media_code) IS NOT NULL
    );
  END IF;

  IF _session_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_session
  FROM public.exam_sessions
  WHERE id = _session_id
    AND user_id = v_user
    AND ministerial_model_id IS NOT NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT esq.id, m->>'placement' INTO v_esq_id, v_placement
  FROM public.exam_session_questions esq
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(esq.rendered_media, '[]'::jsonb)) m
  WHERE esq.exam_session_id = _session_id
    AND m->>'media_id' = _media_id::text
  LIMIT 1;
  IF v_esq_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_placement IS DISTINCT FROM 'SOLUTION' THEN
    RETURN true;
  END IF;

  -- Solution images follow the same gate as the solution text.
  IF v_session.status <> 'in_progress' THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.exam_session_answers a
    WHERE a.session_id = _session_id
      AND a.exam_session_question_id = v_esq_id
      AND a.revealed_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ministerial_media_can_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ministerial_media_can_access(uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- 12) Admin list (media + has_sessions) and update (new revision, media aware)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ministerial_model_questions_admin_list(_model_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_result jsonb;
  v_has_sessions boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.can_publish_ministerial_exams(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ministerial_exam_models WHERE id = _model_id) THEN
    RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002';
  END IF;
  v_has_sessions := EXISTS (SELECT 1 FROM public.exam_sessions WHERE ministerial_model_id = _model_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'question_id', mq.question_id, 'question_code', mq.source_question_code,
    'question_text', qr.question_text, 'display_order', mq.sort_order, 'marks', mq.marks,
    'options', coalesce((SELECT jsonb_agg(jsonb_build_object('option_code', qo.option_code, 'body', qo.body, 'is_correct', qo.is_correct) ORDER BY qo.sort_order) FROM public.question_options qo WHERE qo.question_revision_id = mq.published_revision_id), '[]'::jsonb),
    'model_answer', qs.model_answer, 'explanation', qs.explanation,
    'media', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'media_id', qm.id,
        'placement', public.ministerial_media_placement(qm.media_code),
        'alt_text_ar', qm.alt_text_ar,
        'mime_type', qm.mime_type,
        'file_size', qm.file_size,
        'sha256', qm.sha256
      ) ORDER BY qm.sort_order)
      FROM public.question_media qm
      WHERE qm.question_revision_id = mq.published_revision_id
        AND public.ministerial_media_placement(qm.media_code) IS NOT NULL
    ), '[]'::jsonb),
    'has_sessions', v_has_sessions
  ) ORDER BY mq.sort_order), '[]'::jsonb) INTO v_result
  FROM public.ministerial_exam_questions mq
  JOIN public.question_revisions qr ON qr.id = mq.published_revision_id
  LEFT JOIN public.question_solutions qs ON qs.question_revision_id = mq.published_revision_id AND qs.solution_code = 'MODEL'
  WHERE mq.model_id = _model_id;
  RETURN v_result;
END; $$;

-- Old 10-argument signature is replaced by the media-aware one (default NULL =
-- carry existing media over unchanged, so current callers keep working).
DROP FUNCTION IF EXISTS public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text);

CREATE OR REPLACE FUNCTION public.ministerial_model_question_update(
  _model_id uuid, _question_id uuid, _question_text text, _options jsonb,
  _correct_option_code text, _model_answer text, _explanation text,
  _display_order integer, _marks numeric, _reason text,
  _media jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid(); v_model public.ministerial_exam_models; v_membership public.ministerial_exam_questions;
  v_old_revision uuid; v_new_revision uuid; v_revision_number integer; v_track text; v_option jsonb;
  v_legacy_options jsonb; v_correct_index integer;
  v_media_norm jsonb; v_media_count integer := 0; v_media_changed boolean := _media IS NOT NULL;
BEGIN
  IF v_actor IS NULL OR NOT public.can_publish_ministerial_exams(v_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(trim(_question_text),'')='' OR coalesce(trim(_reason),'')='' OR _display_order < 1 OR _marks <= 0 THEN RAISE EXCEPTION 'invalid_question_payload' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id=_model_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'model_not_found' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.exam_sessions WHERE ministerial_model_id=_model_id) THEN RAISE EXCEPTION 'MINISTERIAL_EDIT_BLOCKED_SESSIONS_EXIST' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_membership FROM public.ministerial_exam_questions WHERE model_id=_model_id AND question_id=_question_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'question_not_in_model' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.ministerial_exam_questions WHERE model_id=_model_id AND sort_order=_display_order AND question_id<>_question_id) THEN RAISE EXCEPTION 'display_order_already_used' USING ERRCODE='23505'; END IF;
  SELECT ct.track_code INTO v_track FROM public.curriculum_tracks ct WHERE ct.id=v_model.curriculum_track_id;
  IF v_track='sanaa' AND (jsonb_typeof(_options)<>'array' OR jsonb_array_length(_options)<>4 OR upper(coalesce(_correct_option_code,'')) NOT IN ('A','B','C','D')) THEN RAISE EXCEPTION 'sanaa_question_requires_four_options' USING ERRCODE='22023'; END IF;
  IF v_track='aden' AND coalesce(trim(_model_answer),'')='' THEN RAISE EXCEPTION 'aden_question_requires_model_answer' USING ERRCODE='22023'; END IF;
  -- Validate media before touching any row so a bad payload never leaves a half-built revision.
  IF v_media_changed THEN
    v_media_norm := public._ministerial_validate_media_array(_media, v_track);
  END IF;
  v_old_revision := v_membership.published_revision_id;
  SELECT coalesce(max(revision_number),0)+1 INTO v_revision_number FROM public.question_revisions WHERE question_id=_question_id;
  INSERT INTO public.question_revisions(question_id,revision_number,status,interaction_type,grading_mode,educational_label,question_text,max_score,allow_partial,requires_media,manual_grading_required,payload_hash_version,source_payload_hash,created_by)
  VALUES(_question_id,v_revision_number,'DRAFT',CASE WHEN v_track='sanaa' THEN 'SINGLE_CHOICE' ELSE 'LONG_TEXT' END,CASE WHEN v_track='sanaa' THEN 'AUTO_SINGLE' ELSE 'MANUAL' END,'MINISTERIAL_PREVIOUS_EXAM',trim(_question_text),_marks,false,false,v_track='aden','canonical_payload_v1',public.cf10_text_sha256(jsonb_build_object('question_text',trim(_question_text),'options',_options,'correct_option_code',_correct_option_code,'model_answer',_model_answer,'explanation',_explanation,'marks',_marks,'media',_media)::text),v_actor) RETURNING id INTO v_new_revision;
  IF v_track='sanaa' THEN
    FOR v_option IN SELECT value FROM jsonb_array_elements(_options) LOOP
      IF upper(coalesce(v_option->>'option_code','')) NOT IN ('A','B','C','D') OR coalesce(trim(v_option->>'body'),'')='' THEN RAISE EXCEPTION 'invalid_option' USING ERRCODE='22023'; END IF;
      INSERT INTO public.question_options(question_revision_id,option_code,body,sort_order,is_correct) VALUES(v_new_revision,upper(v_option->>'option_code'),trim(v_option->>'body'),ascii(upper(v_option->>'option_code'))-65,upper(v_option->>'option_code')=upper(_correct_option_code));
    END LOOP;
  END IF;
  INSERT INTO public.question_solutions(question_revision_id,solution_code,solution_type,sort_order,model_answer,explanation,reveal_policy,created_by) VALUES(v_new_revision,'MODEL','MODEL',0,nullif(trim(_model_answer),''),nullif(trim(_explanation),''),'AFTER_SUBMIT',v_actor);
  -- Targets are revision-scoped: carry them over so EXACT_REVISION_PARITY in
  -- can_publish_ministerial_model() still holds and the model can be re-published
  -- (the 20260913 baseline skipped this, leaving every edited model unpublishable).
  INSERT INTO public.question_targets(question_id,revision_id,target_type,subject_id,unit_id,lesson_id,is_primary,created_by)
  SELECT _question_id,v_new_revision,t.target_type,t.subject_id,t.unit_id,t.lesson_id,t.is_primary,v_actor
  FROM public.question_targets t WHERE t.revision_id=v_old_revision;
  IF NOT FOUND THEN
    INSERT INTO public.question_targets(question_id,revision_id,target_type,subject_id,is_primary,created_by)
    VALUES(_question_id,v_new_revision,'SUBJECT',v_model.subject_id,true,v_actor);
  END IF;
  IF v_media_changed THEN
    v_media_count := public._ministerial_insert_revision_media(v_new_revision, v_media_norm, v_actor, true);
  ELSE
    INSERT INTO public.question_media(question_revision_id,media_code,storage_path,mime_type,file_size,sha256,alt_text_ar,caption,sort_order,requires_media,created_by)
    SELECT v_new_revision,qm.media_code,qm.storage_path,qm.mime_type,qm.file_size,qm.sha256,qm.alt_text_ar,qm.caption,qm.sort_order,qm.requires_media,v_actor
    FROM public.question_media qm WHERE qm.question_revision_id=v_old_revision;
    GET DIAGNOSTICS v_media_count = ROW_COUNT;
    IF v_media_count > 0 THEN UPDATE public.question_revisions SET requires_media=true WHERE id=v_new_revision; END IF;
  END IF;
  UPDATE public.question_revisions SET payload_hash=public._qb_compute_revision_payload_hash(v_new_revision) WHERE id=v_new_revision;
  UPDATE public.question_revisions SET status='APPROVED',reviewed_at=now(),reviewed_by=v_actor WHERE id=v_new_revision;
  UPDATE public.questions SET current_published_revision_id=NULL WHERE id=_question_id;
  UPDATE public.question_revisions SET status='SUPERSEDED',superseded_at=now() WHERE id=v_old_revision;
  UPDATE public.question_revisions SET status='PUBLISHED',published_at=now(),published_by=v_actor WHERE id=v_new_revision;
  SELECT coalesce(jsonb_agg(value->>'body' ORDER BY value->>'option_code'),'[]'::jsonb) INTO v_legacy_options FROM jsonb_array_elements(CASE WHEN v_track='sanaa' THEN _options ELSE '[]'::jsonb END);
  v_correct_index := CASE upper(coalesce(_correct_option_code,'')) WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 2 WHEN 'D' THEN 3 ELSE -1 END;
  UPDATE public.questions SET question_text=trim(_question_text),options=v_legacy_options,correct_index=v_correct_index,explanation=nullif(trim(_explanation),''),sort_order=_display_order,current_published_revision_id=v_new_revision WHERE id=_question_id;
  -- Demote BEFORE touching membership: the published-membership guard rejects
  -- pointer changes on a published model (the 20260913 baseline updated the
  -- membership first and therefore failed for published, session-free models).
  UPDATE public.ministerial_exam_models SET status='draft',published_at=NULL,published_by=NULL WHERE id=_model_id;
  UPDATE public.ministerial_exam_questions SET published_revision_id=v_new_revision,sort_order=_display_order,marks=_marks WHERE model_id=_model_id AND question_id=_question_id;
  UPDATE public.exam_template_questions SET sort_order=_display_order,points=_marks WHERE template_id=v_model.template_id AND question_id=_question_id;
  INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata) VALUES(v_actor,'ministerial_question_update','question',_question_id,jsonb_build_object('model_id',_model_id,'old_revision_id',v_old_revision,'new_revision_id',v_new_revision,'reason',_reason,'media_changed',v_media_changed,'media_count',v_media_count));
  RETURN jsonb_build_object('question_id',_question_id,'published_revision_id',v_new_revision,'status','draft','media_count',v_media_count);
END; $$;

REVOKE ALL ON FUNCTION public.ministerial_model_questions_admin_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ministerial_model_questions_admin_list(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb) TO authenticated, service_role;

-- ============================================================================
-- 13) Proof block
-- ============================================================================
DO $proof$
DECLARE
  v_prepare text;
  v_execute text;
  v_session text;
  v_state text;
  v_reveal text;
  v_result text;
  v_update text;
  v_access text;
BEGIN
  SELECT pg_get_functiondef('public.ministerial_track_package_prepare(jsonb)'::regprocedure) INTO v_prepare;
  SELECT pg_get_functiondef('public.ministerial_track_package_execute(uuid,text)'::regprocedure) INTO v_execute;
  SELECT pg_get_functiondef('public.create_ministerial_exam_session(uuid,text)'::regprocedure) INTO v_session;
  SELECT pg_get_functiondef('public.get_ministerial_session_state(uuid)'::regprocedure) INTO v_state;
  SELECT pg_get_functiondef('public.reveal_ministerial_training_answer(uuid,uuid)'::regprocedure) INTO v_reveal;
  SELECT pg_get_functiondef('public.get_ministerial_session_result(uuid)'::regprocedure) INTO v_result;
  SELECT pg_get_functiondef('public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb)'::regprocedure) INTO v_update;
  SELECT pg_get_functiondef('public.ministerial_media_can_access(uuid,uuid)'::regprocedure) INTO v_access;

  IF position('_ministerial_validate_media_array' in v_prepare) = 0
     OR position('MINISTERIAL_PACKAGE_MEDIA_REQUIRES_V2' in v_prepare) = 0
     OR position('_ministerial_insert_revision_media' in v_execute) = 0
     OR position('_qb_compute_revision_payload_hash' in v_execute) = 0
     OR position('can_publish_ministerial_model' in v_execute) = 0
     OR position('_ministerial_revision_rendered_media' in v_session) = 0
     OR position('<> ''SOLUTION''' in v_state) = 0
     OR position('solution_media' in v_reveal) = 0
     OR position('solution_media' in v_result) = 0
     OR position('MINISTERIAL_EDIT_BLOCKED_SESSIONS_EXIST' in v_update) = 0
     OR position('_ministerial_insert_revision_media' in v_update) = 0
     OR position('revealed_at IS NOT NULL' in v_access) = 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_MEDIA_GUARD_MISSING';
  END IF;
  -- Session-facing functions must never expose storage paths.
  IF position('storage_path' in v_state) > 0 OR position('storage_path' in v_result) > 0
     OR position('storage_path' in v_reveal) > 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_MEDIA_STORAGE_PATH_LEAK';
  END IF;
  IF has_function_privilege('anon', 'public.ministerial_track_package_prepare(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.ministerial_track_package_execute(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.ministerial_media_can_access(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._ministerial_insert_revision_media(uuid,jsonb,uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._ministerial_media_object_verified(text,bigint,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MINISTERIAL_MEDIA_PRIVILEGE_LEAK';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_session_questions' AND column_name = 'rendered_media'
  ) THEN
    RAISE EXCEPTION 'MINISTERIAL_MEDIA_COLUMN_MISSING';
  END IF;
END
$proof$;

COMMIT;
