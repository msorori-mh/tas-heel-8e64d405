-- CONTENT_FACTORY_09_AUTHORITATIVE_IDENTITY_BINDING
-- Status: SOURCE-READY / NOT APPLIED TO PRODUCTION.
-- Scope: immutable, fail-closed binding of a CF08 batch to existing curriculum rows.
-- Explicitly absent: curriculum creation, domain-content writes, publish, READY.

CREATE TABLE public.golden_lesson_identity_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL UNIQUE
    REFERENCES public.golden_lesson_domain_stage_batches(id) ON DELETE RESTRICT,
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  curriculum_track_ids uuid[] NOT NULL CHECK (cardinality(curriculum_track_ids) > 0),
  external_lesson_code text NOT NULL,
  identity_snapshot jsonb NOT NULL,
  identity_sha256 text NOT NULL CHECK (identity_sha256 ~ '^[a-f0-9]{64}$'),
  bound_by uuid NOT NULL REFERENCES auth.users(id),
  bound_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.golden_lesson_identity_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.golden_lesson_identity_bindings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.golden_lesson_identity_bindings TO authenticated;
GRANT ALL ON public.golden_lesson_identity_bindings TO service_role;

CREATE POLICY "golden identity staff read"
  ON public.golden_lesson_identity_bindings FOR SELECT TO authenticated
  USING (public.is_golden_lesson_content_staff(auth.uid()));

CREATE TRIGGER golden_identity_binding_immutable
  BEFORE UPDATE OR DELETE ON public.golden_lesson_identity_bindings
  FOR EACH ROW EXECUTE FUNCTION public.reject_golden_domain_stage_mutation();

CREATE OR REPLACE FUNCTION public.golden_lesson_bind_authoritative_identity(
  _batch_id uuid, _actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  batch public.golden_lesson_domain_stage_batches;
  ver public.golden_lesson_package_versions;
  existing public.golden_lesson_identity_bindings;
  ident jsonb;
  grade_row public.grades;
  subject_row public.subjects;
  lesson_row public.lessons;
  unit_row public.units;
  track_codes text[];
  track_ids uuid[];
  snapshot jsonb;
  snapshot_sha text;
BEGIN
  IF NOT public.golden_lesson_has_role(_actor_id, 'admin') THEN
    RAISE EXCEPTION 'IDENTITY_BIND_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO batch FROM public.golden_lesson_domain_stage_batches
   WHERE id = _batch_id FOR UPDATE;
  IF batch.id IS NULL THEN
    RAISE EXCEPTION 'DOMAIN_STAGE_BATCH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO ver FROM public.golden_lesson_package_versions
   WHERE package_id = batch.package_id AND version = batch.package_version;
  IF ver.id IS NULL OR ver.verified_bundle_sha256 IS DISTINCT FROM batch.verified_bundle_sha256 THEN
    RAISE EXCEPTION 'IDENTITY_BIND_VERSION_DRIFT' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO existing FROM public.golden_lesson_identity_bindings WHERE batch_id = _batch_id;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('binding_id', existing.id, 'identity_sha256', existing.identity_sha256,
      'idempotent', true, 'writes_performed', 0, 'domain_writes_performed', 0);
  END IF;

  ident := ver.manifest->'identity';
  IF jsonb_typeof(ident) <> 'object' THEN
    RAISE EXCEPTION 'IDENTITY_MANIFEST_MISSING' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT lower(btrim(value)) ORDER BY lower(btrim(value))) INTO track_codes
    FROM jsonb_array_elements_text(ident->'curriculumTrackCodes');
  IF track_codes IS NULL OR cardinality(track_codes) = 0
     OR cardinality(track_codes) <> jsonb_array_length(ident->'curriculumTrackCodes') THEN
    RAISE EXCEPTION 'IDENTITY_TRACK_SET_INVALID' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) FROM public.grades WHERE lower(btrim(slug)) = lower(btrim(ident->>'gradeCode'))) <> 1 THEN
    RAISE EXCEPTION 'IDENTITY_GRADE_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO grade_row FROM public.grades WHERE lower(btrim(slug)) = lower(btrim(ident->>'gradeCode'));

  IF (SELECT count(*) FROM public.curriculum_tracks
       WHERE lower(btrim(track_code)) = ANY(track_codes) AND is_active) <> cardinality(track_codes) THEN
    RAISE EXCEPTION 'IDENTITY_TRACK_NOT_EXACTLY_ONE_ACTIVE' USING ERRCODE = '23514';
  END IF;
  SELECT array_agg(id ORDER BY lower(btrim(track_code))) INTO track_ids
    FROM public.curriculum_tracks
   WHERE lower(btrim(track_code)) = ANY(track_codes) AND is_active;

  IF (SELECT count(*) FROM public.subjects WHERE lower(btrim(code)) = lower(btrim(ident->>'subjectCode'))) <> 1 THEN
    RAISE EXCEPTION 'IDENTITY_SUBJECT_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO subject_row FROM public.subjects WHERE lower(btrim(code)) = lower(btrim(ident->>'subjectCode'));
  IF subject_row.grade_id IS DISTINCT FROM grade_row.id THEN
    RAISE EXCEPTION 'IDENTITY_SUBJECT_GRADE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM public.subject_curriculum_tracks
       WHERE subject_id = subject_row.id AND curriculum_track_id = ANY(track_ids) AND is_active)
       <> cardinality(track_ids) THEN
    RAISE EXCEPTION 'IDENTITY_SUBJECT_TRACK_BINDING_MISSING' USING ERRCODE = '23514';
  END IF;

  IF ident->>'unitCode' IS NULL THEN
    unit_row := NULL;
  ELSE
    IF (SELECT count(*) FROM public.units
         WHERE subject_id = subject_row.id AND lower(btrim(code)) = lower(btrim(ident->>'unitCode'))) <> 1 THEN
      RAISE EXCEPTION 'IDENTITY_UNIT_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO unit_row FROM public.units
     WHERE subject_id = subject_row.id AND lower(btrim(code)) = lower(btrim(ident->>'unitCode'));
  END IF;

  -- Import Contract 01 defines (subject_id, lessons.slug) as the lesson natural key.
  -- lessonCode remains the external Content Factory code; lessonSlug binds the live row.
  IF (SELECT count(*) FROM public.lessons
       WHERE subject_id = subject_row.id AND lower(btrim(slug)) = lower(btrim(ident->>'lessonSlug'))) <> 1 THEN
    RAISE EXCEPTION 'IDENTITY_LESSON_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO lesson_row FROM public.lessons
   WHERE subject_id = subject_row.id AND lower(btrim(slug)) = lower(btrim(ident->>'lessonSlug'));
  IF lesson_row.unit_id IS DISTINCT FROM unit_row.id THEN
    RAISE EXCEPTION 'IDENTITY_LESSON_UNIT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  snapshot := jsonb_build_object(
    'grade', jsonb_build_object('id',grade_row.id,'slug',grade_row.slug),
    'tracks', (SELECT jsonb_agg(jsonb_build_object('id',id,'code',track_code) ORDER BY lower(btrim(track_code)))
                 FROM public.curriculum_tracks WHERE id = ANY(track_ids)),
    'subject', jsonb_build_object('id',subject_row.id,'code',subject_row.code,'gradeId',subject_row.grade_id),
    'unit', CASE WHEN unit_row.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('id',unit_row.id,'code',unit_row.code,'subjectId',unit_row.subject_id) END,
    'lesson', jsonb_build_object('id',lesson_row.id,'slug',lesson_row.slug,'subjectId',lesson_row.subject_id,'unitId',lesson_row.unit_id),
    'externalLessonCode', ident->>'lessonCode'
  );
  snapshot_sha := encode(digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex');

  INSERT INTO public.golden_lesson_identity_bindings(
    batch_id,grade_id,subject_id,lesson_id,unit_id,curriculum_track_ids,
    external_lesson_code,identity_snapshot,identity_sha256,bound_by)
  VALUES (_batch_id,grade_row.id,subject_row.id,lesson_row.id,unit_row.id,track_ids,
    ident->>'lessonCode',snapshot,snapshot_sha,_actor_id)
  RETURNING * INTO existing;

  RETURN jsonb_build_object('binding_id',existing.id,'identity_sha256',snapshot_sha,
    'idempotent',false,'writes_performed',1,'domain_writes_performed',0,
    'curriculum_creation_performed',false);
END;
$$;

REVOKE ALL ON FUNCTION public.golden_lesson_bind_authoritative_identity(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golden_lesson_bind_authoritative_identity(uuid,uuid) TO service_role;

COMMENT ON TABLE public.golden_lesson_identity_bindings IS
  'Immutable exact binding to existing curriculum identity; never creates curriculum or publishes content.';
